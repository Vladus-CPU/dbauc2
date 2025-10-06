from flask import jsonify 
import traceback

class AppError(Exception):
    statuscode = 500
    message = "Server error"
    def __init__(self, message=None, statuscode=None, details=None):
        super().__init__(message or self.message)
        if message:
            self.message = message
        if statuscode:
            self.statuscode = statuscode
        self.details = details
        
    def errorlist(self):
        error_response = {
            "error": self.message,
            "statuscode": self.statuscode
        }
        if self.details:
            error_response["details"] = self.details
        return error_response

class OrderDataError(AppError):
    statuscode = 400
    message = "Invalid order data"

class DBError(AppError):
    statuscode = 503
    message = "Database error"

def RegisterErrorRoutes(app):
    @app.errorhandler(AppError)
    def ErrorResponse(err):
        response = jsonify(err.errorlist())
        response.status_code = err.statuscode
        print(f"AppError: {err.message} (Status: {err.statuscode})")
        return response

    @app.errorhandler(404)
    def NotFoundResponse(err):
        print(f"Not Found Error: {err}")
        return jsonify({"error": "404"}), 404

    @app.errorhandler(Exception)
    def GenericErrorResponse(err):
        print(f"Generic Error: {err}")
        traceback.print_exc()
        response = jsonify({"error": "Server error", "details": str(err)})
        response.status_code = 500
        return response
