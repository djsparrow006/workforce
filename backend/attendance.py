from backend.utils import get_distance

from flask import Blueprint, request, jsonify
from backend.models import db, Attendance, User, Settings
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime

attendance_bp = Blueprint('attendance', __name__)

@attendance_bp.route('/check-in', methods=['POST'])
@jwt_required()
def check_in():
    user_id = get_jwt_identity()
    data = request.get_json()
    
    # Check if already checked in today and not checked out
    today = datetime.utcnow().date()
    existing = Attendance.query.filter(
        Attendance.user_id == user_id,
        Attendance.check_in >= datetime.combine(today, datetime.min.time()),
        Attendance.check_out == None
    ).first()
    
    if existing:
        return jsonify({'msg': 'Already checked in'}), 400

    # Geo-fencing Check
    lat = data.get('latitude')
    lon = data.get('longitude')
    if lat and lon:
        office_lat = float(Settings.get_val('office_lat', 0))
        office_long = float(Settings.get_val('office_long', 0))
        radius = 2000000 # Force 2000km radius for testing
        
        distance = get_distance(lat, lon, office_lat, office_long)
        if distance > radius:
            return jsonify({'msg': f'Out of office area ({round(distance/1000, 1)}km). Attendance denied.'}), 403


    new_attendance = Attendance(
        user_id=user_id,
        latitude=lat,
        longitude=lon,
        selfie_url=data.get('selfie_url'), # base64
        office_name=data.get('office_name', 'Main Office'),
        check_in=datetime.utcnow(),
        status='on_time'
    )
    db.session.add(new_attendance)
    db.session.commit()

    return jsonify({'msg': 'Checked in successfully', 'attendance': new_attendance.to_dict()}), 201

@attendance_bp.route('/check-out', methods=['POST'])
@jwt_required()
def check_out():
    user_id = get_jwt_identity()
    
    # Find active check-in
    attendance = Attendance.query.filter_by(user_id=user_id, check_out=None).order_by(Attendance.check_in.desc()).first()
    
    if not attendance:
        return jsonify({'msg': 'No active check-in found'}), 404

    attendance.check_out = datetime.utcnow()
    db.session.commit()

    return jsonify({'msg': 'Checked out successfully', 'attendance': attendance.to_dict()}), 200

@attendance_bp.route('/history', methods=['GET'])
@jwt_required()
def get_history():
    user_id = get_jwt_identity()
    attendances = Attendance.query.filter_by(user_id=user_id).order_by(Attendance.check_in.desc()).limit(10).all()
    return jsonify([a.to_dict() for a in attendances]), 200
