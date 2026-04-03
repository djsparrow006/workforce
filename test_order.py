import json
from app import app
from backend.models import db, User, Order

with app.app_context():
    emp = User.query.filter_by(role='employee').first()
    if emp:
        o = Order(user_id=emp.id, title="Test Order 1", address="123 Road", status="assigned")
        db.session.add(o)
        db.session.commit()
        print("Created order")
    else:
        print("No emp found")
