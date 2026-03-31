from flask import Blueprint, request, jsonify
from backend.models import db, Notification
from flask_jwt_extended import jwt_required, get_jwt_identity

notifications_bp = Blueprint('notifications', __name__)

@notifications_bp.route('/', methods=['GET'])
@jwt_required()
def get_notifications():
    user_id = int(get_jwt_identity())
    notifications = Notification.query.filter_by(user_id=user_id).order_by(Notification.created_at.desc()).all()
    return jsonify([n.to_dict() for n in notifications]), 200

@notifications_bp.route('/mark-read', methods=['POST'])
@jwt_required()
def mark_read():
    user_id = int(get_jwt_identity())
    unread = Notification.query.filter_by(user_id=user_id, is_read=False).all()
    for n in unread:
        n.is_read = True
    db.session.commit()
    return jsonify({'msg': 'Notifications marked as read'}), 200
