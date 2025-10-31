import os
from dotenv import load_dotenv
<<<<<<< HEAD

=======
>>>>>>> a4bfcf4425373ef479ca8fe1bb8bdf555b55d1fc
load_dotenv()

DB_CONFIG = {
    'host': os.getenv('DB_HOST'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_NAME'),
    'port': int(os.getenv('DB_PORT')),
<<<<<<< HEAD
}
=======
}
>>>>>>> a4bfcf4425373ef479ca8fe1bb8bdf555b55d1fc
