from flask import Blueprint, jsonify
from backend.models import db, User, Attendance, Leave, Order, Settings
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
import calendar

salary_bp = Blueprint('salary', __name__)

@salary_bp.route('/summary', methods=['GET'])
@jwt_required()
def get_salary_summary():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'msg': 'User not found'}), 404

    now = datetime.now()
    month_start = datetime(now.year, now.month, 1)
    last_day = calendar.monthrange(now.year, now.month)[1]
    month_end = datetime(now.year, now.month, last_day, 23, 59, 59)

    # 1. Attendance & Leaves
    attendance_count = Attendance.query.filter(
        Attendance.user_id == user_id,
        Attendance.check_in >= month_start,
        Attendance.check_in <= month_end
    ).group_by(db.func.date(Attendance.check_in)).count()

    leaves = Leave.query.filter(
        Leave.user_id == user_id,
        Leave.status == 'approved',
        Leave.start_date <= month_end.date(),
        Leave.end_date >= month_start.date()
    ).all()
    
    leave_days = 0
    for l in leaves:
        start = max(l.start_date, month_start.date())
        end = min(l.end_date, month_end.date())
        leave_days += (end - start).days + 1

    # 2. Performance Stats
    orders = Order.query.filter(
        Order.user_id == user_id,
        Order.status == 'completed',
        Order.completed_at >= month_start,
        Order.completed_at <= month_end
    ).all()
    
    order_count = len(orders)
    total_km = sum(o.distance_km for o in orders)

    # 3. Calculation Logic
    commission_rate = float(Settings.get_val('rate_per_order', 50))
    km_rate = float(Settings.get_val('rate_per_km', 5))
    
    # Base Salary Calculation (Pro-rated for 22 working days)
    base_salary = user.salary
    working_days = attendance_count + leave_days
    attendance_pay = min(base_salary, (working_days / 22) * base_salary)
    
    # Performance Pay
    total_commission = order_count * commission_rate
    total_travel_pay = total_km * km_rate
    
    net_salary = attendance_pay + total_commission + total_travel_pay

    return jsonify({
        'base_salary': round(base_salary, 2),
        'attendance_pay': round(attendance_pay, 2),
        'performance_commission': round(total_commission, 2),
        'travel_incentive': round(total_travel_pay, 2),
        'net_salary': round(net_salary, 2),
        'stats': {
            'attendance_days': attendance_count,
            'leave_days': leave_days,
            'orders_completed': order_count,
            'total_km': round(total_km, 2)
        },
        'month': now.strftime('%B %Y')
    }), 200
