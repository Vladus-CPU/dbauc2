from flask import Flask, jsonify, request, g
from flask_cors import CORS
from mysql.connector import Error, connect
from config import DB_CONFIG 
from errors import AppError, OrderDataError, DBError, RegisterErrorRoutes
from flask import send_from_directory, abort
import os
import datetime
import jwt
from passlib.hash import bcrypt

app = Flask(__name__)
RegisterErrorRoutes(app)
CORS(app)


@app.route('/')
def serve_root():
    frontend_dir = os.path.abspath(os.path.join(app.root_path, '..', 'frontend'))
    index_path = os.path.join(frontend_dir, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(frontend_dir, 'index.html')
    abort(404)

@app.route('/<path:filename>')
def serve_frontend_file(filename):
    frontend_dir = os.path.abspath(os.path.join(app.root_path, '..', 'frontend'))
    target_path = os.path.join(frontend_dir, filename)
    if os.path.exists(target_path) and os.path.isfile(target_path):
        return send_from_directory(frontend_dir, filename)
    index_path = os.path.join(frontend_dir, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(frontend_dir, 'index.html')
    abort(404)

def db_connection():
    try:
        connection = connect(**DB_CONFIG)
        if connection.is_connected():
            return connection
        raise DBError("Database connection failed")
    except Error as exception:
        print("Error while connecting to MySQL", exception)
        raise DBError("Database connection failed", details=str(exception))


def ensure_listings_table(connection):
    """Create listings table if it doesn't exist."""
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS listings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT NULL,
                starting_bid DECIMAL(12,2) NOT NULL,
                current_bid DECIMAL(12,2) NULL,
                unit VARCHAR(64) NOT NULL,
                image VARCHAR(512) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        connection.commit()
    finally:
        cursor.close()

def ensure_users_table(connection):
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL UNIQUE,
                email VARCHAR(255) NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                is_admin BOOLEAN NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        connection.commit()
    finally:
        cursor.close()

def try_add_owner_columns(connection):
    """Best-effort add owner/creator columns if missing (dev convenience)."""
    cur = connection.cursor()
    try:
        try:
            cur.execute("ALTER TABLE listings ADD COLUMN owner_id INT NULL")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_id)")
        except Exception:
            pass
        try:
            cur.execute("ALTER TABLE orders ADD COLUMN creator_id INT NULL")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_creator ON orders(creator_id)")
        except Exception:
            pass
        connection.commit()
    finally:
        cur.close()


def ensure_orders_table(connection):
    """Create orders table for global double auction if it doesn't exist."""
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type ENUM('buy','sell') NOT NULL,
                cost DECIMAL(12,2) NOT NULL,
                amount DECIMAL(12,4) NOT NULL,
                remaining_amount DECIMAL(12,4) NOT NULL,
                status ENUM('open','partial','filled','canceled') NOT NULL DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_orders_type_cost (type, cost),
                INDEX idx_orders_status (status),
                INDEX idx_orders_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        connection.commit()
    finally:
        cursor.close()


def ensure_trades_table(connection):
    """Create trades table for matched orders if it doesn't exist."""
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS trades (
                id INT AUTO_INCREMENT PRIMARY KEY,
                buy_order_id INT NOT NULL,
                sell_order_id INT NOT NULL,
                price DECIMAL(12,2) NOT NULL,
                amount DECIMAL(12,4) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (buy_order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (sell_order_id) REFERENCES orders(id) ON DELETE CASCADE,
                INDEX idx_trades_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        connection.commit()
    finally:
        cursor.close()

JWT_SECRET = os.environ.get('JWT_SECRET', 'dev_secret_change_me')
JWT_ALGO = 'HS256'
JWT_TTL_MIN = int(os.environ.get('JWT_TTL_MIN', '60'))

def create_token(user):
    now = datetime.datetime.now(datetime.timezone.utc)
    exp = now + datetime.timedelta(minutes=JWT_TTL_MIN)
    payload = {
        'sub': user['id'],
        'username': user['username'],
        'is_admin': int(user.get('is_admin', 0)),
        'iat': int(now.timestamp()),
        'exp': int(exp.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def decode_token(token):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception as e:
        raise AppError("Invalid or expired token", statuscode=401, details=str(e))


def get_auth_user(connection):
    """Parse Authorization header and set g.user if token valid. Return user dict or None."""
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        return None
    token = auth.split(' ', 1)[1].strip()
    data = decode_token(token)
    user_id = data.get('sub')
    cur = connection.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, username, email, is_admin, created_at FROM users WHERE id=%s", (user_id,))
        user = cur.fetchone()
        g.user = user
        return user
    finally:
        cur.close()


def require_auth(f):
    from functools import wraps
    @wraps(f)
    def wrapper(*args, **kwargs):
        conn = db_connection()
        try:
            ensure_users_table(conn)
            user = get_auth_user(conn)
            if not user:
                raise AppError("Unauthorized", statuscode=401)
            return f(*args, **kwargs)
        finally:
            conn.close()
    return wrapper


def require_admin(f):
    from functools import wraps
    @wraps(f)
    def wrapper(*args, **kwargs):
        conn = db_connection()
        try:
            ensure_users_table(conn)
            user = get_auth_user(conn)
            if not user or int(user.get('is_admin', 0)) != 1:
                raise AppError("Forbidden", statuscode=403)
            return f(*args, **kwargs)
        finally:
            conn.close()
    return wrapper


def row_to_listing(row):
    """Map DB row (dict) to API shape expected by frontend."""
    if not row:
        return None
    def _as_float(v):
        try:
            return float(v) if v is not None else None
        except Exception:
            return None
    return {
        "id": row.get("id"),
        "title": row.get("title"),
        "description": row.get("description"),
        "startingBid": _as_float(row.get("starting_bid")),
        "currentBid": _as_float(row.get("current_bid")),
        "unit": row.get("unit"),
        "image": row.get("image"),
        "createdAt": row.get("created_at").isoformat() if row.get("created_at") else None,
    }


@app.route('/api/listings', methods=['GET'])
def api_get_listings():
    connection = db_connection()
    try:
        ensure_listings_table(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, title, description, starting_bid, current_bid, unit, image, created_at FROM listings ORDER BY created_at DESC"
        )
        rows = cursor.fetchall()
        listings = [row_to_listing(r) for r in rows]
        return jsonify(listings), 200
    except Error as exception:
        raise DBError("Error fetching listings", details=str(exception))
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        connection.close()


@app.route('/api/listings', methods=['POST'])
def api_create_listing():
    conn_auth = db_connection()
    try:
        ensure_users_table(conn_auth)
        user = get_auth_user(conn_auth)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        owner_id = user['id']
    finally:
        conn_auth.close()
    data = request.get_json(silent=True) or {}
    title = data.get('title')
    starting_bid = data.get('startingBid')
    unit = data.get('unit')
    description = data.get('description')
    image = data.get('image')

    if not isinstance(title, str) or not title.strip():
        raise OrderDataError("Field 'title' is required and must be a string")
    if not isinstance(starting_bid, (int, float)):
        raise OrderDataError("Field 'startingBid' is required and must be a number")
    if not isinstance(unit, str) or not unit.strip():
        raise OrderDataError("Field 'unit' is required and must be a string")

    connection = db_connection()
    try:
        ensure_listings_table(connection)
        try_add_owner_columns(connection)
        cursor = connection.cursor()
        sql = (
            "INSERT INTO listings (title, description, starting_bid, current_bid, unit, image, owner_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)"
        )
        values = (
            title.strip(),
            (description or None),
            float(starting_bid),
            None,
            unit.strip(),
            (image or None),
            owner_id
        )
        cursor.execute(sql, values)
        connection.commit()
        new_id = cursor.lastrowid
        cursor.close()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, title, description, starting_bid, current_bid, unit, image, created_at FROM listings WHERE id = %s",
            (new_id,)
        )
        row = cursor.fetchone()
        return jsonify(row_to_listing(row)), 201
    except Error as exception:
        try:
            connection.rollback()
        except Exception:
            pass
        raise DBError("Error creating listing", details=str(exception))
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        connection.close()
# на модулі 
@app.route('/api/orders', methods=['GET'])
def get_orders():
    connection = db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        ensure_orders_table(connection)
        cursor.execute("SELECT id, type, cost, amount, remaining_amount, status, created_at FROM orders WHERE status IN ('open','partial')")
        orders = cursor.fetchall()
        bids = [o for o in orders if o['type'] == 'buy']
        asks = [o for o in orders if o['type'] == 'sell']
        bids = sorted(bids, key=lambda x: (float(x['cost']), x['created_at']), reverse=True)
        asks = sorted(asks, key=lambda x: (float(x['cost']), x['created_at']))
        return jsonify({"bids": bids, "asks": asks}), 200
    except Error as exception:
        raise DBError("Error fetching orders", details=str(exception))
    finally:
        cursor.close()
        connection.close()
    
@app.route('/api/orders', methods=['POST'])
def create_order():
    conn_auth = db_connection()
    try:
        ensure_users_table(conn_auth)
        user = get_auth_user(conn_auth)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        creator_id = user['id']
    finally:
        conn_auth.close()
    connection = db_connection()
    dataorders = request.get_json(silent=True) or {}
    ordertype = dataorders.get('type')
    cost = dataorders.get('cost')
    amount = dataorders.get('amount')
    if ordertype not in ['buy', 'sell']:
        raise OrderDataError("Field 'type' must be 'buy' or 'sell'")
    if not isinstance(cost, (int, float)) or float(cost) <= 0:
        raise OrderDataError("Field 'cost' must be a positive number")
    if not isinstance(amount, (int, float)) or float(amount) <= 0:
        raise OrderDataError("Field 'amount' must be a positive number")

    cursor = connection.cursor()
    try:
        ensure_orders_table(connection)
        try_add_owner_columns(connection)
        SQL = (
            "INSERT INTO orders (type, cost, amount, remaining_amount, status, creator_id) "
            "VALUES (%s, %s, %s, %s, %s, %s)"
        )
        VALUES = (ordertype, float(cost), float(amount), float(amount), 'open', creator_id)
        cursor.execute(SQL, VALUES)
        connection.commit()
        new_id = cursor.lastrowid
        return jsonify({"message": "Order created successfully", "id": new_id}), 201
    except Error as exception:
        try:
            connection.rollback()
        except Exception:
            pass
        raise DBError("Error creating order", details=str(exception))
    finally:
        cursor.close()
        connection.close()

@app.route('/api/auth/register', methods=['POST'])
def register():
    conn = db_connection()
    ensure_users_table(conn)
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    email = (data.get('email') or '').strip() or None
    if not username or not password:
        raise AppError("Username and password required", statuscode=400)
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id FROM users WHERE username=%s", (username,))
        if cur.fetchone():
            return jsonify({"error": "Username already exists"}), 409
        pwd_hash = bcrypt.hash(password)
        cur.close()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (username, email, password_hash, is_admin) VALUES (%s, %s, %s, %s)",
            (username, email, pwd_hash, 0)
        )
        conn.commit()
        return jsonify({"message": "Registered"}), 201
    except Error as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise DBError("Error registering user", details=str(e))
    finally:
        cur.close()
        conn.close()


@app.route('/api/auth/login', methods=['POST'])
def login():
    conn = db_connection()
    ensure_users_table(conn)
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        raise AppError("Username and password required", statuscode=400)
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, username, email, password_hash, is_admin, created_at FROM users WHERE username=%s", (username,))
        user = cur.fetchone()
        if not user or not bcrypt.verify(password, user['password_hash']):
            return jsonify({"error": "Invalid credentials"}), 401
        token = create_token(user)
        return jsonify({
            "token": token,
            "user": {
                "id": user['id'],
                "username": user['username'],
                "email": user['email'],
                "is_admin": int(user['is_admin']),
                "created_at": user['created_at'].isoformat() if user['created_at'] else None,
            }
        })
    finally:
        cur.close()
        conn.close()


@app.route('/api/auth/me', methods=['GET'])
def me():
    conn = db_connection()
    try:
        ensure_users_table(conn)
        user = get_auth_user(conn)
        if not user:
            return jsonify({"authenticated": False}), 200
        return jsonify({"authenticated": True, "user": user})
    finally:
        conn.close()


# Admin routes
@app.route('/api/admin/users', methods=['GET'])
def admin_users():
    conn_auth = db_connection()
    try:
        ensure_users_table(conn_auth)
        user = get_auth_user(conn_auth)
        if not user or int(user.get('is_admin', 0)) != 1:
            raise AppError("Forbidden", statuscode=403)
    finally:
        conn_auth.close()
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, username, email, is_admin, created_at FROM users ORDER BY created_at DESC")
        return jsonify(cur.fetchall())
    finally:
        cur.close()
        conn.close()


@app.route('/api/admin/listings', methods=['GET'])
def admin_listings():
    conn_auth = db_connection()
    try:
        ensure_users_table(conn_auth)
        user = get_auth_user(conn_auth)
        if not user or int(user.get('is_admin', 0)) != 1:
            raise AppError("Forbidden", statuscode=403)
    finally:
        conn_auth.close()
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_listings_table(conn)
        cur.execute("SELECT * FROM listings ORDER BY created_at DESC")
        return jsonify(cur.fetchall())
    finally:
        cur.close()
        conn.close()


@app.route('/api/admin/orders', methods=['GET'])
def admin_orders():
    conn_auth = db_connection()
    try:
        ensure_users_table(conn_auth)
        user = get_auth_user(conn_auth)
        if not user or int(user.get('is_admin', 0)) != 1:
            raise AppError("Forbidden", statuscode=403)
    finally:
        conn_auth.close()
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_orders_table(conn)
        cur.execute("SELECT * FROM orders ORDER BY created_at DESC")
        return jsonify(cur.fetchall())
    finally:
        cur.close()
        conn.close()
        

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)