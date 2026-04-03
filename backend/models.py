from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from flask_bcrypt import Bcrypt

db = SQLAlchemy()
bcrypt = Bcrypt()

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), default='employee') # 'admin' or 'employee'
    salary = db.Column(db.Float, default=0.0)
    leave_balance = db.Column(db.Integer, default=20) # Annual leave balance
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    attendances = db.relationship('Attendance', backref='user', lazy=True)
    leaves = db.relationship('Leave', backref='user', lazy=True)
    expenses = db.relationship('Expense', backref='user', lazy=True)
    orders = db.relationship('Order', backref='user', lazy=True)
    breaks = db.relationship('Break', backref='user', lazy=True)

    def set_password(self, password):
        self.password = bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password):
        return bcrypt.check_password_hash(self.password, password)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'role': self.role,
            'salary': self.salary,
            'leave_balance': self.leave_balance,
            'created_at': self.created_at.isoformat()
        }

class Attendance(db.Model):
    __tablename__ = 'attendances'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    check_in = db.Column(db.DateTime, default=datetime.utcnow)
    check_out = db.Column(db.DateTime, nullable=True)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    selfie_url = db.Column(db.Text, nullable=True) # Use Text for base64
    status = db.Column(db.String(50), default='on_time') # 'on_time', 'late', 'early'
    office_name = db.Column(db.String(100), nullable=True)
    is_on_break = db.Column(db.Boolean, default=False)
    break_duration_minutes = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'check_in': self.check_in.isoformat() if self.check_in else None,
            'check_out': self.check_out.isoformat() if self.check_out else None,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'selfie_url': self.selfie_url,
            'status': self.status,
            'office_name': self.office_name,
            'is_on_break': self.is_on_break,
            'break_duration_minutes': self.break_duration_minutes
        }

class Leave(db.Model):
    __tablename__ = 'leaves'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    leave_type = db.Column(db.String(50), nullable=False) # e.g., 'sick', 'casual'
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    reason = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(20), default='pending') # 'pending', 'approved', 'rejected'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'leave_type': self.leave_type,
            'start_date': self.start_date.isoformat(),
            'end_date': self.end_date.isoformat(),
            'reason': self.reason,
            'status': self.status,
            'created_at': self.created_at.isoformat()
        }

class Expense(db.Model):
    __tablename__ = 'expenses'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    description = db.Column(db.String(255), nullable=True)
    proof_url = db.Column(db.Text, nullable=True) # base64
    status = db.Column(db.String(20), default='pending') # 'pending', 'approved', 'rejected'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'amount': self.amount,
            'description': self.description,
            'proof_url': self.proof_url,
            'status': self.status,
            'created_at': self.created_at.isoformat()
        }

class Settings(db.Model):
    __tablename__ = 'settings'
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(50), unique=True, nullable=False)
    value = db.Column(db.String(255), nullable=False)

    @classmethod
    def get_val(cls, key, default=None):
        setting = cls.query.filter_by(key=key).first()
        return setting.value if setting else default

class Order(db.Model):
    __tablename__ = 'orders'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), nullable=True)
    address = db.Column(db.String(255), nullable=True) # Customer/delivery address
    status = db.Column(db.String(50), default='assigned') 
    # Status: 'assigned', 'employee_arrived_at_store', 'order_picked_up', 'order_delivered'

    # Original fields (assignment location)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    customer_lat = db.Column(db.Float, nullable=True)
    customer_long = db.Column(db.Float, nullable=True)
    distance_km = db.Column(db.Float, default=0.0)
    assigned_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # New workflow fields: Store arrival
    store_arrival_time = db.Column(db.DateTime, nullable=True)
    store_arrival_lat = db.Column(db.Float, nullable=True)
    store_arrival_lng = db.Column(db.Float, nullable=True)
    
    # Pickup confirmation
    pickup_time = db.Column(db.DateTime, nullable=True)
    pickup_lat = db.Column(db.Float, nullable=True)
    pickup_lng = db.Column(db.Float, nullable=True)
    
    # Delivery confirmation
    delivery_time = db.Column(db.DateTime, nullable=True)
    delivery_lat = db.Column(db.Float, nullable=True)
    delivery_lng = db.Column(db.Float, nullable=True)
    delivery_proof_url = db.Column(db.Text, nullable=True) # base64 photo/signature
    
    # Kept for backward compatibility
    completed_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'address': self.address,
            'status': self.status,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'customer_lat': self.customer_lat,
            'customer_long': self.customer_long,
            'distance_km': self.distance_km,
            'assigned_at': self.assigned_at.isoformat() if self.assigned_at else None,
            'store_arrival_time': self.store_arrival_time.isoformat() if self.store_arrival_time else None,
            'store_arrival_lat': self.store_arrival_lat,
            'store_arrival_lng': self.store_arrival_lng,
            'pickup_time': self.pickup_time.isoformat() if self.pickup_time else None,
            'pickup_lat': self.pickup_lat,
            'pickup_lng': self.pickup_lng,
            'delivery_time': self.delivery_time.isoformat() if self.delivery_time else None,
            'delivery_lat': self.delivery_lat,
            'delivery_lng': self.delivery_lng,
            'delivery_proof_url': self.delivery_proof_url,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }

class Notification(db.Model):
    __tablename__ = 'notifications'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False) # Recipient
    message = db.Column(db.String(255), nullable=False)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'message': self.message,
            'is_read': self.is_read,
            'created_at': self.created_at.isoformat()
        }

class Break(db.Model):
    __tablename__ = 'breaks'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    start_time = db.Column(db.DateTime, default=datetime.utcnow)
    end_time = db.Column(db.DateTime, nullable=True)  # None if ongoing
    duration_minutes = db.Column(db.Integer, nullable=True)  # Calculated on end
    break_type = db.Column(db.String(50), default='lunch')  # 'lunch', 'rest', 'personal'
    is_active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'duration_minutes': self.duration_minutes,
            'break_type': self.break_type,
            'is_active': self.is_active
        }

