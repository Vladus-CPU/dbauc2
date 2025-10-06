from flask import jsonify
import traceback

# Renamed to look a bit more "student-ish" while keeping structure.
class AppErr(Exception):
    statuscode = 500
    message = "Server error"

    def __init__(self, message=None, statuscode=None, details=None):
        super().__init__(message or self.message)
        if message:
            self.message = message
        if statuscode:
            self.statuscode = statuscode
        self.details = details

    def to_dict(self):
        payload = {
            "error": self.message,
            "statuscode": self.statuscode
        }
        if self.details:
            payload["details"] = self.details
        return payload


class OrderDataErr(AppErr):
    statuscode = 400
    message = "Invalid order data"


class DbErr(AppErr):
    statuscode = 503
    message = "Database error"


def setup_error_handlers(app):
    @app.errorhandler(AppErr)
    def handle_app_err(err: AppErr):
        response = jsonify(err.to_dict())
        response.status_code = err.statuscode
        print(f"AppErr: {err.message} (Status: {err.statuscode})")
        return response

    @app.errorhandler(404)
    def handle_not_found(err):
        print(f"Not Found: {err}")
        return jsonify({"error": "404"}), 404

    @app.errorhandler(Exception)
    def handle_generic(err):
        print(f"Generic Error: {err}")
        traceback.print_exc()
        response = jsonify({"error": "Server error", "details": str(err)})
        response.status_code = 500
        return response

__all__ = [
    'AppErr', 'OrderDataErr', 'DbErr', 'setup_error_handlers',
    # legacy exported names
    'AppError', 'OrderDataError', 'DBError', 'RegisterErrorRoutes'
]

# Backward compatibility (old names)
AppError = AppErr
OrderDataError = OrderDataErr
DBError = DbErr
RegisterErrorRoutes = setup_error_handlers
