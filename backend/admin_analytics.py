from flask import Blueprint, jsonify, request
from backend.models import db, User, Attendance, Leave, Order, Settings
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime

admin_analytics_bp = Blueprint('admin_analytics', __name__)

@admin_analytics_bp.route('/employee-details', methods=['GET'])
@jwt_required()
def get_all_employee_details():
    try:
        user_id = int(get_jwt_identity())
    except (ValueError, TypeError):
        return jsonify({'msg': 'Invalid user identity'}), 401
        
    admin = User.query.get(user_id)
    if not admin or admin.role != 'admin':
        return jsonify({'msg': 'Admin access required'}), 403

    # Fetch all employees
    employees = User.query.filter_by(role='employee').all()
    
    results = []
    today = datetime.utcnow().date()
    
    for emp in employees:
        # Last login (latest attendance today)
        attendance = Attendance.query.filter(
            Attendance.user_id == emp.id,
            Attendance.check_in >= datetime.combine(today, datetime.min.time())
        ).order_by(Attendance.check_in.desc()).first()
        
        # Completed orders today
        order_count = Order.query.filter(
            Order.user_id == emp.id,
            Order.completed_at >= datetime.combine(today, datetime.min.time())
        ).count()
        
        # Online status: Checked in today AND hasn't checked out yet
        is_online = bool(attendance and not attendance.check_out)
        
        # Pending assigned orders
        assigned_count = Order.query.filter_by(user_id=emp.id, status='assigned').count()
        
        results.append({
            'user_id': emp.id,
            'name': emp.name,
            'login_time': attendance.check_in.isoformat() if attendance else None,
            'last_lat': attendance.latitude if attendance else None,
            'last_long': attendance.longitude if attendance else None,
            'orders_completed': order_count,
            'assigned_orders': assigned_count,
            'is_online': is_online,
            'leave_status': 'Present' if attendance else 'Absent'
        })
        
    return jsonify(results), 200

@admin_analytics_bp.route('/employee/<int:target_user_id>/history', methods=['GET'])
@jwt_required()
def get_employee_full_history(target_user_id):
    try:
        user_id = int(get_jwt_identity())
    except (ValueError, TypeError):
        return jsonify({'msg': 'Invalid user identity'}), 401
        
    admin = User.query.get(user_id)
    if not admin or admin.role != 'admin':
        return jsonify({'msg': 'Admin access required'}), 403

    user = User.query.get(target_user_id)
    if not user:
        return jsonify({'msg': 'User not found'}), 404

    leaves = Leave.query.filter_by(user_id=target_user_id).all()
    orders = Order.query.filter_by(user_id=target_user_id).limit(10).all()
    
    return jsonify({
        'user': user.to_dict(),
        'leaves': [l.to_dict() for l in leaves],
        'orders': [o.to_dict() for o in orders]
    }), 200

@admin_analytics_bp.route('/settings', methods=['GET'])
@jwt_required()
def get_settings():
    try:
        user_id = int(get_jwt_identity())
    except (ValueError, TypeError):
        return jsonify({'msg': 'Invalid user identity'}), 401
        
    admin = User.query.get(user_id)
    if not admin or admin.role != 'admin':
        return jsonify({'msg': 'Admin access required'}), 403
    
    settings = Settings.query.all()
    return jsonify({s.key: s.value for s in settings}), 200

@admin_analytics_bp.route('/settings', methods=['POST'])
@jwt_required()
def update_settings():
    try:
        user_id = int(get_jwt_identity())
    except (ValueError, TypeError):
        return jsonify({'msg': 'Invalid user identity'}), 401
        
    admin = User.query.get(user_id)
    if not admin or admin.role != 'admin':
        return jsonify({'msg': 'Admin access required'}), 403
    
    data = request.get_json()
    for key, value in data.items():
        setting = Settings.query.filter_by(key=key).first()
        if setting:
            setting.value = str(value)
        else:
            db.session.add(Settings(key=key, value=str(value)))
    
    db.session.commit()
    return jsonify({'msg': 'Settings updated successfully'}), 200

@admin_analytics_bp.route('/create-user', methods=['POST'])
@jwt_required()
def create_employee():
    try:
        user_id = int(get_jwt_identity())
    except (ValueError, TypeError):
        return jsonify({'msg': 'Invalid user identity'}), 401
        
    admin = User.query.get(user_id)
    if not admin or admin.role != 'admin':
        return jsonify({'msg': 'Admin access required'}), 403
        
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    salary = data.get('salary', 30000.0)
    
    if not name or not email or not password:
        return jsonify({'msg': 'Name, Email and Password are required'}), 400
        
    if User.query.filter_by(email=email).first():
        return jsonify({'msg': 'User with this email already exists'}), 400
        
    new_user = User(
        name=name,
        email=email,
        role='employee',
        salary=float(salary)
    )
    new_user.set_password(password)
    
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({'msg': f'Employee {name} created successfully', 'user': new_user.to_dict()}), 201
