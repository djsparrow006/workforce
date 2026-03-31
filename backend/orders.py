from flask import Blueprint, request, jsonify
from backend.models import db, Order, User, Settings
from backend.utils import get_distance
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime

orders_bp = Blueprint('orders', __name__)

@orders_bp.route('/assign', methods=['POST'])
@jwt_required()
def assign_order():
    admin_id = int(get_jwt_identity())
    admin = User.query.get(admin_id)
    if not admin or admin.role != 'admin':
        return jsonify({'msg': 'Admin access required'}), 403
    
    data = request.get_json()
    target_user_id = data.get('user_id')
    title = data.get('title')
    
    if not target_user_id or not title:
        return jsonify({'msg': 'User ID and Title required'}), 400
    
    new_order = Order(
        user_id=target_user_id,
        title=title,
        status='assigned'
    )
    db.session.add(new_order)
    db.session.commit()
    
    return jsonify({
        'msg': 'Order assigned successfully!',
        'order': new_order.to_dict()
    }), 201

@orders_bp.route('/complete', methods=['POST'])
@jwt_required()
def complete_order():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    curr_lat = data.get('latitude')
    curr_long = data.get('longitude')
    
    # For reliability, we need a destination. In a real app, this would be from the Order record.
    # For this demo, we'll allow the frontend to pass the 'intended' destination or we use a default.
    cust_lat = data.get('customer_lat', 14.6000) # Default nearby demo point
    cust_long = data.get('customer_long', 78.0010)
    
    if not curr_lat or not curr_long:
        return jsonify({'msg': 'GPS location required for delivery verification'}), 400

    # 1. Geo-fencing: Must be near customer
    dist_to_cust = get_distance(curr_lat, curr_long, cust_lat, cust_long)
    if dist_to_cust > 500.0: # Force 500km radius for testing
        return jsonify({'msg': f'Too far from customer ({round(dist_to_cust)}m). Move closer to complete.'}), 403

    # 2. Distance Tracking (for Salary): Distance from Office to Customer
    office_lat = float(Settings.get_val('office_lat', 14.5995))
    office_long = float(Settings.get_val('office_long', 78.0000))
    dist_from_office = get_distance(office_lat, office_long, cust_lat, cust_long) / 1000.0 # Convert to KM
    
    # Update existing assigned order OR create new one if none assigned
    order = Order.query.filter_by(user_id=user_id, status='assigned').first()
    if not order:
        order = Order(user_id=user_id)
        db.session.add(order)
    
    order.latitude = curr_lat
    order.longitude = curr_long
    order.customer_lat = cust_lat
    order.customer_long = cust_long
    order.distance_km = round(dist_from_office, 2)
    order.status = 'completed'
    order.completed_at = datetime.utcnow()
    
    db.session.commit()

    return jsonify({
        'msg': 'Order verified and completed!',
        'distance': round(dist_from_office, 2),
        'order': order.to_dict()
    }), 201

@orders_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_order_stats():
    user_id = int(get_jwt_identity())
    orders = Order.query.filter_by(user_id=user_id).all()
    total_km = sum(o.distance_km for o in orders)
    return jsonify({
        'completed_orders': len(orders),
        'total_distance_km': round(total_km, 2)
    }), 200
