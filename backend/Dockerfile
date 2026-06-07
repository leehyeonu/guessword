# Base Image
FROM python:3.10-slim

# Set working directory inside container
WORKDIR /app

# Install system dependencies needed to compile C++ source code (required for FastText bindings)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first for caching optimization
COPY requirements.txt .

# Install python packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . .

# Expose FastAPI default port
EXPOSE 8000

# Run FastAPI backend using uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
