import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from backend.models import db, User, Attendance, Leave, Expense, Settings
from backend.auth import auth_bp
from backend.attendance import attendance_bp
from backend.leave_management import leave_bp
from backend.expense_management import expense_bp
from backend.salary_engine import salary_bp
from backend.admin_analytics import admin_analytics_bp
from backend.orders import orders_bp

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///workforce.db')
    if app.config['SQLALCHEMY_DATABASE_URI'].startswith("postgres://"):
        app.config['SQLALCHEMY_DATABASE_URI'] = app.config['SQLALCHEMY_DATABASE_URI'].replace("postgres://", "postgresql://", 1)
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'workforce-management-super-secret-key-2026')
    
    db.init_app(app)
    CORS(app)
    JWTManager(app)
    
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(attendance_bp, url_prefix='/api/attendance')
    app.register_blueprint(leave_bp, url_prefix='/api/leave')
    app.register_blueprint(expense_bp, url_prefix='/api/expense')
    app.register_blueprint(salary_bp, url_prefix='/api/salary')
    app.register_blueprint(admin_analytics_bp, url_prefix='/api/admin')
    app.register_blueprint(orders_bp, url_prefix='/api/orders')
    
    @app.route('/')
    def index():
        return send_from_directory('../frontend', 'index.html')
    
    @app.route('/<path:path>')
    def serve_static(path):
        return send_from_directory('../frontend', path)
    
    with app.app_context():
        db.create_all()
        # Seed an admin user if not exists
        if not User.query.filter_by(email='admin@workforce.com').first():
            admin = User(name='Admin User', email='admin@workforce.com', role='admin', salary=50000.0)
            admin.set_password('admin123')
            db.session.add(admin)
            
        # Seed an employee user if not exists
        if not User.query.filter_by(email='employee@workforce.com').first():
            emp = User(name='Employee User', email='employee@workforce.com', role='employee', salary=30000.0)
            emp.set_password('emp123')
            db.session.add(emp)

        # Seed initial app settings
        if not Settings.query.filter_by(key='office_lat').first():
            db.session.add(Settings(key='office_lat', value='14.5995')) # Default placeholder (e.g. Hyderabad approx)
            db.session.add(Settings(key='office_long', value='78.0000'))
            db.session.add(Settings(key='office_radius_meters', value='200'))
            
        db.session.commit()
        
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, host='0.0.0.0', port=5000)
