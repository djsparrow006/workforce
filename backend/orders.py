from flask import Blueprint, request, jsonify
from backend.models import db, Order, User, Settings, Notification
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
    address = data.get('address', '')
    
    if not target_user_id or not title:
        return jsonify({'msg': 'User ID and Title required'}), 400
    
    new_order = Order(
        user_id=target_user_id,
        title=title,
        address=address,
        customer_lat=data.get('customer_lat', 14.5995), # Default to office if not set
        customer_long=data.get('customer_long', 78.0000),
        status='assigned'
    )

    db.session.add(new_order)
    
    # Notify employee
    notif = Notification(
        user_id=target_user_id,
        message=f'New Order Assigned: {title}. Address: {address}'
    )
    db.session.add(notif)
    
    db.session.commit()

    return jsonify({
        'msg': 'Order assigned successfully!',
        'order': new_order.to_dict()
    }), 201

# NEW WORKFLOW ENDPOINTS

@orders_bp.route('/arrived-at-store', methods=['POST'])
@jwt_required()
def arrived_at_store():
    """Employee checks in at store/pickup location"""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'employee':
        return jsonify({'msg': 'Employee access required'}), 403
    
    data = request.get_json()
    order_id = data.get('order_id')
    curr_lat = data.get('latitude')
    curr_lng = data.get('longitude')
    
    if not order_id or curr_lat is None or curr_lng is None:
        return jsonify({'msg': 'order_id and GPS coordinates required'}), 400
    
    order = Order.query.filter_by(id=order_id, user_id=user_id, status='assigned').first()
    if not order:
        return jsonify({'msg': 'Order not found or already in progress'}), 404
    
    order.status = 'employee_arrived_at_store'
    order.store_arrival_time = datetime.utcnow()
    order.store_arrival_lat = curr_lat
    order.store_arrival_lng = curr_lng
    
    # Notify admin
    admins = User.query.filter_by(role='admin').all()
    for admin in admins:
        employee_name = User.query.get(user_id).name
        notif = Notification(
            user_id=admin.id,
            message=f'{employee_name} arrived at store for order: {order.title}'
        )
        db.session.add(notif)
    
    db.session.commit()
    
    return jsonify({
        'msg': 'Successfully checked in at store',
        'order': order.to_dict()
    }), 200

@orders_bp.route('/pickup-confirm', methods=['POST'])
@jwt_required()
def pickup_confirm():
    """Employee confirms order pickup"""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'employee':
        return jsonify({'msg': 'Employee access required'}), 403
    
    data = request.get_json()
    order_id = data.get('order_id')
    curr_lat = data.get('latitude')
    curr_lng = data.get('longitude')
    
    if not order_id or curr_lat is None or curr_lng is None:
        return jsonify({'msg': 'order_id and GPS coordinates required'}), 400
    
    order = Order.query.filter_by(id=order_id, user_id=user_id, 
                                   status='employee_arrived_at_store').first()
    if not order:
        return jsonify({'msg': 'Order not in correct state (must be at store first)'}), 404
    
    order.status = 'order_picked_up'
    order.pickup_time = datetime.utcnow()
    order.pickup_lat = curr_lat
    order.pickup_lng = curr_lng
    
    db.session.commit()
    
    return jsonify({
        'msg': 'Order pickup confirmed',
        'order': order.to_dict()
    }), 200

@orders_bp.route('/delivery-confirm', methods=['POST'])
@jwt_required()
def delivery_confirm():
    """Employee confirms delivery at customer location"""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'employee':
        return jsonify({'msg': 'Employee access required'}), 403
    
    data = request.get_json()
    order_id = data.get('order_id')
    delivery_lat = data.get('latitude')
    delivery_lng = data.get('longitude')
    proof_photo = data.get('proof_photo')  # Optional base64 photo/signature
    
    if not order_id or delivery_lat is None or delivery_lng is None:
        return jsonify({'msg': 'order_id and GPS coordinates required'}), 400
    
    order = Order.query.filter_by(id=order_id, user_id=user_id, 
                                   status='order_picked_up').first()
    if not order:
        return jsonify({'msg': 'Order not in correct state (must be picked up first)'}), 404
    
    # Optional: Validate distance to destination (within 50m is generally ok for delivery)
    if order.customer_lat and order.customer_long:
        dist_to_delivery = get_distance(delivery_lat, delivery_lng, 
                                        order.customer_lat, order.customer_long)
        if dist_to_delivery > 100.0:  # Allow 100m radius for delivery
            return jsonify({
                'msg': f'Delivery location too far from destination ({round(dist_to_delivery)}m). Must be within 100m.',
                'distance': round(dist_to_delivery, 2)
            }), 403
    
    order.status = 'order_delivered'
    order.delivery_time = datetime.utcnow()
    order.delivery_lat = delivery_lat
    order.delivery_lng = delivery_lng
    if proof_photo:
        order.delivery_proof_url = proof_photo
    order.completed_at = datetime.utcnow()
    
    # Calculate distance from office for salary tracking
    office_lat = float(Settings.get_val('office_lat', 14.5995))
    office_lng = float(Settings.get_val('office_long', 78.0000))
    dist_from_office_meters = get_distance(office_lat, office_lng, delivery_lat, delivery_lng)
    order.distance_km = round(dist_from_office_meters / 1000.0, 2)
    
    # Notify admin
    admins = User.query.filter_by(role='admin').all()
    for admin in admins:
        employee_name = User.query.get(user_id).name
        notif = Notification(
            user_id=admin.id,
            message=f'{employee_name} delivered order: {order.title} at ({delivery_lat}, {delivery_lng})'
        )
        db.session.add(notif)
    
    db.session.commit()
    
    return jsonify({
        'msg': 'Order delivery confirmed',
        'distance_km': order.distance_km,
        'order': order.to_dict()
    }), 200

@orders_bp.route('/assigned', methods=['GET'])
@jwt_required()
def get_assigned_orders():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'employee':
        return jsonify({'msg': 'Employee access required'}), 403
    
    statuses = ['assigned', 'employee_arrived_at_store', 'order_picked_up']
    orders = Order.query.filter(Order.user_id == user_id, 
                               Order.status.in_(statuses)).all()
    return jsonify([o.to_dict() for o in orders]), 200

@orders_bp.route('/history', methods=['GET'])
@jwt_required()
def get_order_history():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'employee':
        return jsonify({'msg': 'Employee access required'}), 403
    
    orders = Order.query.filter_by(user_id=user_id, status='order_delivered').all()
    return jsonify([o.to_dict() for o in orders]), 200

@orders_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_order_stats():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'employee':
        return jsonify({'msg': 'Employee access required'}), 403
    
    orders = Order.query.filter_by(user_id=user_id, status='order_delivered').all()
    total_km = sum(o.distance_km for o in orders)
    return jsonify({
        'completed_orders': len(orders),
        'total_distance_km': round(total_km, 2)
    }), 200

# BACKWARD COMPATIBILITY: Keep old complete endpoint but update implementation
@orders_bp.route('/complete', methods=['POST'])
@jwt_required()
def complete_order():
    """DEPRECATED: Use delivery-confirm instead. This endpoint kept for backward compatibility."""
    return delivery_confirm()

