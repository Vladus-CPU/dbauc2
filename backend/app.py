import os
import sys
from importlib import import_module

from flask import Flask
from flask_cors import CORS

if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    __package__ = "backend"
_PACKAGE_ROOT = __package__.split(".")[0]


def _load_blueprints():
    blueprint_specs = [
        ("frontend", "frontend_bp"),
        ("auth", "auth_bp"),
        ("listings", "listings_bp"),
        ("orders", "orders_bp"),
        ("accounts", "accounts_bp"),
        ("resources", "resources_bp"),
        ("auctions", "auctions_bp"),
        ("me", "me_bp"),
        ("admin", "admin_bp"),
        ("wallet", "wallet_bp"),
    ]
    blueprints = []
    for module_name, attr in blueprint_specs:
        module = import_module(f"{_PACKAGE_ROOT}.routes.{module_name}")
        blueprints.append(getattr(module, attr))
    return blueprints


def _ensure_directories(app: Flask) -> None:
    resource_docs = os.path.join(app.root_path, "resource_docs")
    generated_docs = os.path.join(app.root_path, "generated_docs")
    os.makedirs(resource_docs, exist_ok=True)
    os.makedirs(generated_docs, exist_ok=True)
    app.config.setdefault("RESOURCE_DOCS_ROOT", resource_docs)
    app.config.setdefault("GENERATED_DOCS_ROOT", generated_docs)


from .errors import RegisterErrorRoutes


def create_app() -> Flask:
    app = Flask(__name__)
    RegisterErrorRoutes(app)
    CORS(app)
    _ensure_directories(app)
    for blueprint in _load_blueprints():
        app.register_blueprint(blueprint)
    return app


app = create_app()
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
