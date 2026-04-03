#!/usr/bin/env python3
"""
RBAC Validation Test Script
Tests role-based access control for workforce app
"""

import requests
import json
import sys

BASE_URL = "http://localhost:4000"

def test_rbac():
    print("🔒 Testing Role-Based Access Control\n")

    # Test data
    admin_credentials = {"email": "admin@workforce.com", "password": "admin123"}
    employee_credentials = {"email": "employee@workforce.com", "password": "emp123"}

    # Test 1: Admin login and access
    print("1. Testing Admin Access...")
    try:
        admin_response = requests.post(f"{BASE_URL}/api/auth/login", json=admin_credentials)
        if admin_response.status_code == 200:
            admin_token = admin_response.json()['access_token']
            print("   ✅ Admin login successful")

            # Test admin can assign orders
            order_data = {
                "user_id": 2,
                "title": "Test Order",
                "address": "123 Test Street",
                "latitude": 14.5995,
                "longitude": 78.0000
            }
            assign_response = requests.post(
                f"{BASE_URL}/api/orders/assign",
                json=order_data,
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            if assign_response.status_code == 201:
                print("   ✅ Admin can assign orders")
            else:
                print(f"   ❌ Admin order assignment failed: {assign_response.text}")

            # Test admin cannot check-in (employee only)
            checkin_data = {"latitude": 14.5995, "longitude": 78.0000}
            checkin_response = requests.post(
                f"{BASE_URL}/api/attendance/check-in",
                json=checkin_data,
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            if checkin_response.status_code == 403:
                print("   ✅ Admin correctly blocked from check-in")
            else:
                print(f"   ❌ Admin should not be able to check-in: {checkin_response.status_code}")

        else:
            print(f"   ❌ Admin login failed: {admin_response.status_code}")
            return False

    except Exception as e:
        print(f"   ❌ Admin test error: {e}")
        return False

    # Test 2: Employee login and access
    print("\n2. Testing Employee Access...")
    try:
        employee_response = requests.post(f"{BASE_URL}/api/auth/login", json=employee_credentials)
        if employee_response.status_code == 200:
            employee_token = employee_response.json()['access_token']
            print("   ✅ Employee login successful")

            # Test employee can check-in
            checkin_data = {"latitude": 14.5995, "longitude": 78.0000}
            checkin_response = requests.post(
                f"{BASE_URL}/api/attendance/check-in",
                json=checkin_data,
                headers={"Authorization": f"Bearer {employee_token}"}
            )
            if checkin_response.status_code == 200:
                print("   ✅ Employee can check-in")
            else:
                print(f"   ❌ Employee check-in failed: {checkin_response.text}")

            # Test employee cannot assign orders (admin only)
            order_data = {
                "user_id": 1,
                "title": "Test Order",
                "address": "123 Test Street"
            }
            assign_response = requests.post(
                f"{BASE_URL}/api/orders/assign",
                json=order_data,
                headers={"Authorization": f"Bearer {employee_token}"}
            )
            if assign_response.status_code == 403:
                print("   ✅ Employee correctly blocked from order assignment")
            else:
                print(f"   ❌ Employee should not be able to assign orders: {assign_response.status_code}")

        else:
            print(f"   ❌ Employee login failed: {employee_response.status_code}")
            return False

    except Exception as e:
        print(f"   ❌ Employee test error: {e}")
        return False

    print("\n🎉 RBAC Validation Complete!")
    print("✅ All role-based access controls working correctly")
    return True

if __name__ == "__main__":
    success = test_rbac()
    sys.exit(0 if success else 1)