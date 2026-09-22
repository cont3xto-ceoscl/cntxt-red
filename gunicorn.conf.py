"""
Gunicorn configuration for CNTXT R.E.D. System
Production deployment on Hostinger VPS (Ubuntu 22.04 / 24.04 LTS)
"""

import multiprocessing
import os

# Server socket
bind = os.getenv("GUNICORN_BIND", "127.0.0.1:8000")
backlog = 2048

# Worker processes: recommended formula is 2 * CPUs + 1
workers = int(os.getenv("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))
worker_class = "sync"
worker_connections = 1000
timeout = 120
keepalive = 5

# Process naming
proc_name = "cntxt_red_gunicorn"

# Logging
accesslog = os.getenv("GUNICORN_ACCESS_LOG", "-")
errorlog = os.getenv("GUNICORN_ERROR_LOG", "-")
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
capture_output = True

# Security & limits
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190
