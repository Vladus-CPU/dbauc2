from flask import Flask, jsonify, request
from flask_cors import CORS
import MYSQL.connector
from MYSQL.connector import Error, pooling, connect
from config import DB_CONFIG

app = Flask(__name__)
CORS(app)
def db_connection():
    try:
        connection = connect(**DB_CONFIG)
        if connection.is_connected():
            return connection
    except Error as exception:
        print("Error while connecting to MySQL", exception)
        return None
# переїбашу на модулі 
@app.route('/api/orders', methods=['GET'])
def get_orders():
    connection = db_connection()
    if connection is None:
        return {"errormessage": "Database connection failed"}, 500
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM orders") # Видбірка по типу можна додати пізніше 
        orders = cursor.fetchall()
        bids = [order for order in orders if order['type'] == 'buy'] # список з замовленнями на покупку
        asks = [order for order in orders if order['type'] == 'sell'] # список з замовленнями на продаж
        # Можна додати логіку для обробки bids та asks
        # bids sort
        # asks sort
        return jsonify({"bids": bids, "asks": asks}), 200 # ok 
    except Error as exception:
        return {"errormessage": "Error fetching orders"}, 500 # server err
    finally:
        cursor.close()
        connection.close()
    
@app.route('/api/orders', methods=['POST'])
def create_order():
    connection = db_connection()
    if connection is None:
        return {"errormessage": "Database connection failed"}, 500 # server err
    dataorders = request.get_json()
    if not dataorders or 'type' not in dataorders or 'cost' not in dataorders or 'amount' not in dataorders:
        return {"errormessage": "Invalid input"}, 400 # bad request
    # набросок типів 
    ordertype = dataorders['type']
    cost = dataorders['cost']
    amount = dataorders['amount']
    if ordertype not in ['buy', 'sell'] or not isinstance(cost, (int, float)) or not isinstance(amount, (int, float)):
        return {"errormessage": "Invalid order data"}, 400 # bad request
    connection = db_connection() 
    if connection is None: 
        return {"errormessage": "Database connection failed"}, 500 # server err
    cursor = connection.cursor()
    try:
        SQL = "INSERT INTO orders (type, cost, amount) VALUES (%s, %s, %s)"
        VALUES = (ordertype, cost, amount)
        cursor.execute(SQL, VALUES)
        connection.commit()
        cursor.lastrowid
        return {"message": "Order created successfully"}, 201 # created
    except Error as exception:
        try:
            if connection:
                connection.rollback()
        except Exception as rollback_e:
            print("Rollback failed:", rollback_e)
        print("Error creating order:", exception)
        return {"errormessage": "Error creating order: " + str(exception)}, 500 # server err
    finally:
        cursor.close()
        connection.close()