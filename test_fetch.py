import json
from app import app
from flask_jwt_extended import create_access_token
from backend.models import db, User

with app.app_context():
    emp = User.query.filter_by(role='employee').first()
    token = create_access_token(identity=str(emp.id))
    with app.test_client() as client:
        res = client.get('/api/orders/assigned', headers={'Authorization': f'Bearer {token}'})
        print("Status", res.status_code)
        print(res.get_data(as_text=True))
