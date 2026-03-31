import math

def get_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two coordinates in meters."""
    if not lat1 or not lon1 or not lat2 or not lon2:
        return 999999  # Large distance if coords missing
    R = 6371000 # Earth radius in meters
    phi1, phi2 = math.radians(float(lat1)), math.radians(float(lat2))
    dphi = math.radians(float(lat2 - lat1))
    dlambda = math.radians(float(lon2 - lon1))
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1-a))
