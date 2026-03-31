from flask import Blueprint, request, jsonify
from backend.models import db, Leave, User
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime

leave_bp = Blueprint('leave', __name__)

@leave_bp.route('/apply', methods=['POST'])
@jwt_required()
def apply_leave():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    try:
        start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
        end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
    except (KeyError, ValueError):
        return jsonify({'msg': 'Invalid date format. Use YYYY-MM-DD'}), 400

    new_leave = Leave(
        user_id=user_id,
        leave_type=data.get('leave_type', 'casual'),
        start_date=start_date,
        end_date=end_date,
        reason=data.get('reason', ''),
        status='pending'
    )
    db.session.add(new_leave)
    db.session.commit()

    return jsonify({'msg': 'Leave application submitted', 'leave': new_leave.to_dict()}), 201

@leave_bp.route('/history', methods=['GET'])
@jwt_required()
def get_leave_history():
    user_id = int(get_jwt_identity())
    leaves = Leave.query.filter_by(user_id=user_id).order_by(Leave.created_at.desc()).all()
    return jsonify([l.to_dict() for l in leaves]), 200

@leave_bp.route('/approve/<int:leave_id>', methods=['POST'])
@jwt_required()
def approve_leave(leave_id):
    user_id = int(get_jwt_identity())
    admin = User.query.get(user_id)
    if not admin or admin.role != 'admin':
        return jsonify({'msg': 'Admin access required'}), 403

    leave = Leave.query.get(leave_id)
    if not leave:
        return jsonify({'msg': 'Leave application not found'}), 404

    data = request.get_json()
    new_status = data.get('status') # 'approved' or 'rejected'
    if new_status not in ['approved', 'rejected']:
        return jsonify({'msg': 'Invalid status'}), 400

    leave.status = new_status
    
    if new_status == 'approved':
        user = User.query.get(leave.user_id)
        days = (leave.end_date - leave.start_date).days + 1
        user.leave_balance -= days
        
    db.session.commit()
    return jsonify({'msg': f'Leave {new_status}'}), 200

@leave_bp.route('/all-pending', methods=['GET'])
@jwt_required()
def get_all_pending_leaves():
    user_id = int(get_jwt_identity())
    admin = User.query.get(user_id)
    if not admin or admin.role != 'admin':
        return jsonify({'msg': 'Admin access required'}), 403
    
    leaves = db.session.query(Leave, User).join(User).filter(Leave.status == 'pending').all()
    return jsonify([{**l.to_dict(), 'user_name': u.name} for l, u in leaves]), 200
