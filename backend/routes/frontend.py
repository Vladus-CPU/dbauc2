import os
from flask import Blueprint, abort, current_app, send_from_directory

frontend_bp = Blueprint('frontend', __name__)

@frontend_bp.route('/')
def serve_root():
    frontend_dir = os.path.abspath(os.path.join(current_app.root_path, '..', 'frontend'))
    index_path = os.path.join(frontend_dir, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(frontend_dir, 'index.html')
    abort(404)

@frontend_bp.route('/<path:filename>')
def serve_frontend_file(filename):
    frontend_dir = os.path.abspath(os.path.join(current_app.root_path, '..', 'frontend'))
    target_path = os.path.join(frontend_dir, filename)
    if os.path.exists(target_path) and os.path.isfile(target_path):
        return send_from_directory(frontend_dir, filename)
    index_path = os.path.join(frontend_dir, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(frontend_dir, 'index.html')
    abort(404)
