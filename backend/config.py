import os
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', 'dandan_1524'),
    'database': os.environ.get('DB_NAME', 'auction'),
    'port': int(os.environ.get('DB_PORT', '3306')),
}
