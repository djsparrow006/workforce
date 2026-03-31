from flask import Blueprint, request, jsonify
from backend.models import db, Expense, User
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime

expense_bp = Blueprint('expense', __name__)

@expense_bp.route('/submit', methods=['POST'])
@jwt_required()
def submit_expense():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    new_expense = Expense(
        user_id=user_id,
        amount=data.get('amount', 0.0),
        description=data.get('description', ''),
        proof_url=data.get('proof_url', ''), # base64
        status='pending'
    )
    db.session.add(new_expense)
    db.session.commit()

    return jsonify({'msg': 'Expense claim submitted', 'expense': new_expense.to_dict()}), 201

@expense_bp.route('/history', methods=['GET'])
@jwt_required()
def get_expense_history():
    user_id = int(get_jwt_identity())
    expenses = Expense.query.filter_by(user_id=user_id).order_by(Expense.created_at.desc()).all()
    return jsonify([e.to_dict() for e in expenses]), 200

@expense_bp.route('/approve/<int:expense_id>', methods=['POST'])
@jwt_required()
def approve_expense(expense_id):
    user_id = int(get_jwt_identity())
    admin = User.query.get(user_id)
    if not admin or admin.role != 'admin':
        return jsonify({'msg': 'Admin access required'}), 403

    expense = Expense.query.get(expense_id)
    if not expense:
        return jsonify({'msg': 'Expense claim not found'}), 404

    data = request.get_json()
    new_status = data.get('status')
    if new_status not in ['approved', 'rejected']:
        return jsonify({'msg': 'Invalid status'}), 400

    expense.status = new_status
    db.session.commit()
    return jsonify({'msg': f'Expense {new_status}'}), 200

@expense_bp.route('/all-pending', methods=['GET'])
@jwt_required()
def get_all_pending_expenses():
    user_id = int(get_jwt_identity())
    admin = User.query.get(user_id)
    if not admin or admin.role != 'admin':
        return jsonify({'msg': 'Admin access required'}), 403
    
    expenses = db.session.query(Expense, User).join(User).filter(Expense.status == 'pending').all()
    return jsonify([{**e.to_dict(), 'user_name': u.name} for e, u in expenses]), 200
