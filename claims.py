#!/usr/bin/env python3
"""
set_custom_claims.py

Usage:
    python set_custom_claims.py user@example.com

This script initializes the Firebase Admin SDK with a service account,
looks up the specified user's UID by email, and sets their custom claims:
    role = "internal"
    admin = True
"""

import sys
import firebase_admin
from firebase_admin import credentials, auth

def initialize_firebase(service_account_path: str = 'keys/wholesalelaunchpad-6708c-firebase-adminsdk-fbsvc-857ed9a66c.json'):
    """
    Initialize the Firebase Admin SDK.
    If already initialized, this is a no-op.
    """
    try:
        # Only initialize if not already done
        firebase_admin.get_app()
    except ValueError:
        cred = credentials.Certificate(service_account_path)
        firebase_admin.initialize_app(cred)

def set_internal_admin_claims(email: str):
    """
    Look up user by email and set custom claims.
    """
    try:
        user = auth.get_user_by_email(email)
    except auth.UserNotFoundError:
        print(f"Error: No user found for email '{email}'.")
        sys.exit(1)

    claims = {
        'role': 'internal',
        'admin': True
    }

    auth.set_custom_user_claims(user.uid, claims)
    print(f"Custom claims set for UID {user.uid} (email: {email}): {claims}")

def main():
    if len(sys.argv) != 2:
        print("Usage: python set_custom_claims.py user@example.com")
        sys.exit(1)

    email = sys.argv[1]
    # Update this path to point to your downloaded service account JSON
    service_account_path = 'keys/wholesalelaunchpad-6708c-firebase-adminsdk-fbsvc-857ed9a66c.json'

    initialize_firebase(service_account_path)
    set_internal_admin_claims(email)

if __name__ == '__main__':
    main()
