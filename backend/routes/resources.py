import datetime
import os
from uuid import uuid4
from flask import Blueprint, current_app, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename
from ..db import (
    db_connection,
    ensure_resource_documents,
    ensure_resource_transactions,
    ensure_users_table,
)
from ..errors import AppError
from ..security import get_auth_user
from ..utils import clean_string, is_admin, is_trader, serialize

resources_bp = Blueprint('resources', __name__, url_prefix='/api/resources')

@resources_bp.post('/transactions')
def add_resource_transaction():
    conn = db_connection()
    cur = conn.cursor()
    try:
        ensure_users_table(conn)
        user = get_auth_user(conn)
        if not user or not is_trader(user):
            raise AppError("Unauthorized", statuscode=401)
        ensure_resource_transactions(conn)
        data = request.get_json(silent=True) or {}
        ttype = (data.get('type') or '').strip()
        qty = data.get('quantity')
        notes = clean_string(data.get('notes'))
        if ttype not in ('deposit', 'withdraw', 'inventory_add', 'inventory_remove'):
            raise AppError("Invalid type", statuscode=400)
        try:
            quantity_value = float(qty)
        except (TypeError, ValueError):
            raise AppError("Invalid quantity", statuscode=400)
        if quantity_value <= 0:
            raise AppError("Quantity must be positive", statuscode=400)
        cur.execute(
            "INSERT INTO resource_transactions (trader_id, type, quantity, notes) VALUES (%s,%s,%s,%s)",
            (user['id'], ttype, quantity_value, notes)
        )
        conn.commit()
        return jsonify({"message": "Recorded", "id": cur.lastrowid}), 201
    except AppError:
        raise
    except Exception as exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise AppError("Error adding transaction", statuscode=500, details=str(exception))
    finally:
        cur.close()
        conn.close()

@resources_bp.get('/documents/<int:doc_id>/download')
def download_resource_document(doc_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_resource_documents(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        cur.execute("SELECT trader_id, filename, stored_name FROM resource_documents WHERE id=%s", (doc_id,))
        row = cur.fetchone()
        if not row:
            raise AppError("Document not found", statuscode=404)
        admin = is_admin(user)
        if not admin and row['trader_id'] != user['id']:
            raise AppError("Forbidden", statuscode=403)
        trader_dir = os.path.join(current_app.config['RESOURCE_DOCS_ROOT'], str(row['trader_id']))
        full_path = os.path.join(trader_dir, row['stored_name'])
        if not os.path.isfile(full_path):
            raise AppError("File not found on server", statuscode=404)
        return send_from_directory(trader_dir, row['stored_name'], as_attachment=True, download_name=row['filename'])
    finally:
        cur.close()
        conn.close()

@resources_bp.get('/documents')
def list_resource_documents():
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_resource_documents(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        admin = is_admin(user)
        target_trader_id = user['id']
        if admin:
            trader_id_param = request.args.get('traderId')
            if trader_id_param:
                try:
                    target_trader_id = int(trader_id_param)
                except ValueError:
                    raise AppError("Invalid traderId", statuscode=400)
            else:
                target_trader_id = None
        if target_trader_id is None:
            cur.execute(
                "SELECT id, trader_id, filename, uploaded_at, notes FROM resource_documents ORDER BY uploaded_at DESC"
            )
        else:
            cur.execute(
                "SELECT id, trader_id, filename, uploaded_at, notes FROM resource_documents WHERE trader_id=%s ORDER BY uploaded_at DESC",
                (target_trader_id,)
            )
        rows = cur.fetchall()
        documents = []
        for row in rows:
            documents.append({
                "id": row['id'],
                "traderId": row['trader_id'],
                "filename": row['filename'],
                "uploadedAt": row['uploaded_at'].isoformat() if row['uploaded_at'] else None,
                "notes": row['notes'],
                "downloadUrl": f"/api/resources/documents/{row['id']}/download"
            })
        return jsonify(documents)
    finally:
        cur.close()
        conn.close()

@resources_bp.get('/transactions')
def list_resource_transactions():
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        user = get_auth_user(conn)
        if not user or not is_trader(user):
            raise AppError("Unauthorized", statuscode=401)
        ensure_resource_transactions(conn)
        cur.execute(
            "SELECT id, type, quantity, occurred_at, notes FROM resource_transactions WHERE trader_id=%s ORDER BY occurred_at DESC",
            (user['id'],)
        )
        return jsonify(serialize(cur.fetchall()))
    finally:
        cur.close()
        conn.close()

@resources_bp.post('/documents')
def upload_resource_document():
    conn = db_connection()
    try:
        ensure_users_table(conn)
        ensure_resource_documents(conn)
        user = get_auth_user(conn)
        if not user or not is_trader(user):
            raise AppError("Unauthorized", statuscode=401)
        if 'file' not in request.files:
            raise AppError("File upload required", statuscode=400)
        file = request.files['file']
        if not file or file.filename is None:
            raise AppError("Invalid file", statuscode=400)
        original_name = secure_filename(file.filename)
        if not original_name:
            raise AppError("Invalid filename", statuscode=400)
        note = clean_string(request.form.get('note'))
        timestamp = int(datetime.datetime.utcnow().timestamp())
        stored_name = f"{timestamp}_{uuid4().hex}{os.path.splitext(original_name)[1]}"
        trader_dir = os.path.join(current_app.config['RESOURCE_DOCS_ROOT'], str(user['id']))
        os.makedirs(trader_dir, exist_ok=True)
        full_path = os.path.join(trader_dir, stored_name)
        file.save(full_path)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO resource_documents (trader_id, filename, stored_name, notes) VALUES (%s,%s,%s,%s)",
            (user['id'], original_name, stored_name, note)
        )
        conn.commit()
        doc_id = cur.lastrowid
        cur.close()
        return jsonify({"message": "Document uploaded", "id": doc_id}), 201
    except AppError:
        raise
    except Exception as exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise AppError("Error uploading document", statuscode=500, details=str(exception))
    finally:
        conn.close()