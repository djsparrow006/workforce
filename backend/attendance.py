from backend.utils import get_distance
from flask import Blueprint, request, jsonify
from backend.models import db, Attendance, User, Settings, Break
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime

attendance_bp = Blueprint('attendance', __name__)

@attendance_bp.route('/check-in', methods=['POST'])
@jwt_required()
def check_in():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user or user.role != 'employee':
        return jsonify({'msg': 'Employee access required for attendance'}), 403
    
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
        office_lat = float(Settings.get_val('office_lat', 14.5995))
        office_long = float(Settings.get_val('office_long', 78.0000))
        radius = float(Settings.get_val('office_radius_meters', 200))  # Default 200 meters
        
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
    user = User.query.get(user_id)
    if not user or user.role != 'employee':
        return jsonify({'msg': 'Employee access required for attendance'}), 403
    
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
    user = User.query.get(user_id)
    if not user or user.role != 'employee':
        return jsonify({'msg': 'Employee access required for attendance'}), 403
    
    attendances = Attendance.query.filter_by(user_id=user_id).order_by(Attendance.check_in.desc()).limit(10).all()
    return jsonify([a.to_dict() for a in attendances]), 200

# BREAK MANAGEMENT ENDPOINTS

@attendance_bp.route('/break-start', methods=['POST'])
@jwt_required()
def break_start():
    """Employee starts a break"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user or user.role != 'employee':
        return jsonify({'msg': 'Employee access required for breaks'}), 403
    
    data = request.get_json()
    break_type = data.get('break_type', 'lunch')  # 'lunch', 'rest', 'personal'
    
    if break_type not in ['lunch', 'rest', 'personal']:
        return jsonify({'msg': 'Invalid break_type. Use: lunch, rest, or personal'}), 400
    
    # Check if already on break
    active_break = Break.query.filter_by(user_id=user_id, is_active=True, end_time=None).first()
    if active_break:
        return jsonify({'msg': 'Already on an active break. End it first.'}), 400
    
    # Get today's attendance record
    today = datetime.utcnow().date()
    attendance = Attendance.query.filter(
        Attendance.user_id == user_id,
        Attendance.check_in >= datetime.combine(today, datetime.min.time()),
        Attendance.check_out == None
    ).first()
    
    if not attendance:
        return jsonify({'msg': 'You must be checked in to start a break'}), 400
    
    new_break = Break(
        user_id=user_id,
        start_time=datetime.utcnow(),
        break_type=break_type,
        is_active=True
    )
    
    # Mark attendance as on break
    attendance.is_on_break = True
    
    db.session.add(new_break)
    db.session.commit()
    
    return jsonify({
        'msg': f'Break started: {break_type}',
        'break': new_break.to_dict()
    }), 201

@attendance_bp.route('/break-end', methods=['POST'])
@jwt_required()
def break_end():
    """Employee ends an active break"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user or user.role != 'employee':
        return jsonify({'msg': 'Employee access required for breaks'}), 403
    
    # Find active break
    active_break = Break.query.filter_by(user_id=user_id, is_active=True, end_time=None).first()
    if not active_break:
        return jsonify({'msg': 'No active break found to end'}), 404
    
    active_break.end_time = datetime.utcnow()
    # Calculate duration in minutes
    duration_minutes = int((active_break.end_time - active_break.start_time).total_seconds() / 60)
    active_break.duration_minutes = duration_minutes
    active_break.is_active = False
    
    # Update attendance break tracking
    today = datetime.utcnow().date()
    attendance = Attendance.query.filter(
        Attendance.user_id == user_id,
        Attendance.check_in >= datetime.combine(today, datetime.min.time()),
        Attendance.check_out == None
    ).first()
    
    if attendance:
        # Calculate total break time today
        all_breaks = Break.query.filter_by(user_id=user_id).filter(
            Break.start_time >= datetime.combine(today, datetime.min.time()),
            Break.end_time != None
        ).all()
        total_break_minutes = sum(b.duration_minutes for b in all_breaks if b.duration_minutes)
        attendance.break_duration_minutes = total_break_minutes
        attendance.is_on_break = False
    
    db.session.commit()
    
    return jsonify({
        'msg': 'Break ended',
        'break_duration_minutes': duration_minutes,
        'break': active_break.to_dict()
    }), 200

@attendance_bp.route('/breaks-today', methods=['GET'])
@jwt_required()
def get_breaks_today():
    """Get all breaks for today"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user or user.role != 'employee':
        return jsonify({'msg': 'Employee access required for breaks'}), 403
    
    today = datetime.utcnow().date()
    
    breaks = Break.query.filter_by(user_id=user_id).filter(
        Break.start_time >= datetime.combine(today, datetime.min.time())
    ).all()
    
    total_break_minutes = sum(b.duration_minutes for b in breaks if b.duration_minutes)
    
    return jsonify({
        'breaks': [b.to_dict() for b in breaks],
        'total_break_minutes': total_break_minutes
    }), 200

@attendance_bp.route('/status', methods=['GET'])
@jwt_required()
def get_current_status():
    """Get current attendance and break status"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user or user.role != 'employee':
        return jsonify({'msg': 'Employee access required for attendance status'}), 403
    
    today = datetime.utcnow().date()
    
    # Get today's attendance
    attendance = Attendance.query.filter(
        Attendance.user_id == user_id,
        Attendance.check_in >= datetime.combine(today, datetime.min.time())
    ).order_by(Attendance.check_in.desc()).first()
    
    # Get active break if any
    active_break = Break.query.filter_by(user_id=user_id, is_active=True, end_time=None).first()
    
    return jsonify({
        'is_checked_in': attendance and not attendance.check_out,
        'is_on_break': active_break is not None,
        'attendance': attendance.to_dict() if attendance else None,
        'active_break': active_break.to_dict() if active_break else None
    }), 200
