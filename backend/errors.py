from flask import jsonify 
import traceback

class AppFail(Exception):
    statuscode = 500
    message = "Server error"
    def __init__(self, message=None, statuscode=None, details=None):
        super().__init__(message or self.message)
        if message:
            self.message = message
        if statuscode:
            self.statuscode = statuscode
        self.details = details

    def as_error_dict(self):
        out = {"error": self.message, "statuscode": self.statuscode}
        if self.details:
            out["details"] = self.details
        return out

class BadOrderData(AppFail):
    statuscode = 400
    message = "Invalid order data"

class DbFail(AppFail):
    statuscode = 503
    message = "Database error"

def hook_errors(app):
    @app.errorhandler(AppFail)
    def handle_app_fail(err):
        resp = jsonify(err.as_error_dict())
        resp.status_code = err.statuscode
        print(f"AppFail: {err.message} (Status: {err.statuscode})")
        return resp

    @app.errorhandler(404)
    def handle_not_found(err):
        print(f"Not Found: {err}")
        return jsonify({"error": "404"}), 404

    @app.errorhandler(Exception)
    def handle_generic(err):
        print(f"Generic Error: {err}")
        traceback.print_exc()
        resp = jsonify({"error": "Server error", "details": str(err)})
        resp.status_code = 500
        return resp

__all__ = [
    'AppFail',
    'BadOrderData',
    'DbFail',
    'hook_errors',
]
