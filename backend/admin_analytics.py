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

    # Fetch all data to reconstruct a timeline
    from backend.models import Break
    leaves = Leave.query.filter_by(user_id=target_user_id).all()
    orders = Order.query.filter_by(user_id=target_user_id).all()
    attendances = Attendance.query.filter_by(user_id=target_user_id).all()
    breaks = Break.query.filter_by(user_id=target_user_id).all()
    
    return jsonify({
        'user': user.to_dict(), # Contains created_at
        'leaves': [l.to_dict() for l in leaves],
        'orders': [o.to_dict() for o in orders],
        'attendances': [a.to_dict() for a in attendances],
        'breaks': [b.to_dict() for b in breaks]
    }), 200

@admin_analytics_bp.route('/remove-user/<int:target_user_id>', methods=['DELETE'])
@jwt_required()
def remove_employee(target_user_id):
    try:
        user_id = int(get_jwt_identity())
    except (ValueError, TypeError):
        return jsonify({'msg': 'Invalid user identity'}), 401
        
    admin = User.query.get(user_id)
    if not admin or admin.role != 'admin':
        return jsonify({'msg': 'Admin access required'}), 403
        
    target_user = User.query.get(target_user_id)
    if not target_user:
        return jsonify({'msg': 'User not found'}), 404
        
    if target_user.role == 'admin':
        return jsonify({'msg': 'Cannot remove other admins'}), 400
        
    # Delete related records safely (Manual Cascade)
    from backend.models import Attendance, Leave, Expense, Order, Break, Notification
    Attendance.query.filter_by(user_id=target_user_id).delete()
    Leave.query.filter_by(user_id=target_user_id).delete()
    Expense.query.filter_by(user_id=target_user_id).delete()
    Order.query.filter_by(user_id=target_user_id).delete()
    Break.query.filter_by(user_id=target_user_id).delete()
    Notification.query.filter_by(user_id=target_user_id).delete()

    db.session.delete(target_user)
    db.session.commit()
    
    return jsonify({'msg': 'Employee removed successfully'}), 200

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

@admin_analytics_bp.route('/update-user/<int:target_user_id>', methods=['PUT'])
@jwt_required()
def update_employee(target_user_id):
    try:
        user_id = int(get_jwt_identity())
    except (ValueError, TypeError):
        return jsonify({'msg': 'Invalid user identity'}), 401
        
    admin = User.query.get(user_id)
    if not admin or admin.role != 'admin':
        return jsonify({'msg': 'Admin access required'}), 403
        
    target_user = User.query.get(target_user_id)
    if not target_user:
        return jsonify({'msg': 'User not found'}), 404
        
    data = request.get_json()
    
    if 'name' in data:
        target_user.name = data['name']
    if 'email' in data:
        # Check if email is already taken by another user
        existing_user = User.query.filter_by(email=data['email']).first()
        if existing_user and existing_user.id != target_user_id:
            return jsonify({'msg': 'Email already in use by another user'}), 400
        target_user.email = data['email']
    if 'salary' in data:
        try:
            target_user.salary = float(data['salary'])
        except ValueError:
            return jsonify({'msg': 'Invalid salary value'}), 400
    if 'leave_balance' in data:
        try:
            target_user.leave_balance = int(data['leave_balance'])
        except ValueError:
            return jsonify({'msg': 'Invalid leave balance value'}), 400
            
    db.session.commit()
    return jsonify({'msg': 'Employee updated successfully', 'user': target_user.to_dict()}), 200

@admin_analytics_bp.route('/dash-stats', methods=['GET'])
@jwt_required()
def get_dash_stats():
    try:
        user_id = int(get_jwt_identity())
    except (ValueError, TypeError):
        return jsonify({'msg': 'Invalid user identity'}), 401
        
    admin = User.query.get(user_id)
    if not admin or admin.role != 'admin':
        return jsonify({'msg': 'Admin access required'}), 403
        
    today = datetime.utcnow().date()
    today_start = datetime.combine(today, datetime.min.time())
    
    total_employees = User.query.filter_by(role='employee').count()
    payroll_sum = db.session.query(db.func.sum(User.salary)).filter_by(role='employee').scalar() or 0.0
    
    pending_leaves = Leave.query.filter_by(status='pending').count()
    pending_expenses = db.session.query(db.func.count(User.id)).select_from(User).join(User.expenses).filter(db.text("expenses.status = 'pending'")).scalar() or 0
    # Correction: The relationship might be simpler or need Expense model import
    from backend.models import Expense
    pending_expenses = Expense.query.filter_by(status='pending').count()
    
    deliveries_today = Order.query.filter(Order.status == 'completed', Order.completed_at >= today_start).count()
    assigned_pending = Order.query.filter_by(status='assigned').count()
    
    online_count = 0
    employees = User.query.filter_by(role='employee').all()
    for emp in employees:
        attendance = Attendance.query.filter(Attendance.user_id == emp.id, Attendance.check_in >= today_start).order_by(Attendance.check_in.desc()).first()
        if attendance and not attendance.check_out:
            online_count += 1
            
    return jsonify({
        'total_employees': total_employees,
        'monthly_payroll': payroll_sum,
        'online_count': online_count,
        'pending_leaves': pending_leaves,
        'pending_expenses': pending_expenses,
        'deliveries_today': deliveries_today,
        'assigned_pending': assigned_pending
    }), 200
