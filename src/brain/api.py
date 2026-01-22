"""
FastAPI REST API Server for Vesper Insight
Exposes SQLite alert data via HTTP endpoints for Bruno-based testing
"""
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
from contextlib import contextmanager
from icecream import ic

app = FastAPI(
    title="Vesper Insight API",
    description="REST API for network anomaly detection alerts",
    version="0.1.0"
)

# CORS middleware for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "alerts.db"

@contextmanager
def get_db():
    """Context manager for database connections"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        ic(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail=f"Database error: {str(e)}")


@app.get("/alerts")
async def get_alerts(limit: int = 50, offset: int = 0):
    """
    Fetch alerts with pagination
    
    Args:
        limit: Maximum number of alerts to return (default: 50, max: 1000)
        offset: Number of alerts to skip (default: 0)
    """
    if limit > 1000:
        limit = 1000
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")
    
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, src_ip, dst_ip, src_port, dst_port, proto, score, timestamp
                FROM high_risk_flows
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset)
            )
            rows = cursor.fetchall()
            
            alerts = []
            for row in rows:
                alerts.append({
                    "id": row["id"],
                    "src_ip": row["src_ip"],
                    "dst_ip": row["dst_ip"],
                    "src_port": row["src_port"],
                    "dst_port": row["dst_port"],
                    "proto": row["proto"],
                    "score": row["score"],
                    "timestamp": row["timestamp"]
                })
            
            return {
                "data": alerts,
                "count": len(alerts),
                "limit": limit,
                "offset": offset
            }
    except Exception as e:
        ic(f"Error fetching alerts: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/alerts/{alert_id}")
async def get_alert_by_id(alert_id: int):
    """Fetch a specific alert by ID"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, src_ip, dst_ip, src_port, dst_port, proto, score, timestamp
                FROM high_risk_flows
                WHERE id = ?
                """,
                (alert_id,)
            )
            row = cursor.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
            
            return {
                "id": row["id"],
                "src_ip": row["src_ip"],
                "dst_ip": row["dst_ip"],
                "src_port": row["src_port"],
                "dst_port": row["dst_port"],
                "proto": row["proto"],
                "score": row["score"],
                "timestamp": row["timestamp"]
            }
    except HTTPException:
        raise
    except Exception as e:
        ic(f"Error fetching alert {alert_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/stats")
async def get_stats():
    """Return aggregated statistics"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Total count
            cursor.execute("SELECT COUNT(*) as count FROM high_risk_flows")
            total_row = cursor.fetchone()
            total_count = total_row["count"] if total_row else 0
            
            # Max score
            cursor.execute("SELECT MAX(score) as max_score FROM high_risk_flows")
            max_row = cursor.fetchone()
            max_score = max_row["max_score"] if max_row and max_row["max_score"] is not None else 0.0
            
            # Average score
            cursor.execute("SELECT AVG(score) as avg_score FROM high_risk_flows")
            avg_row = cursor.fetchone()
            avg_score = avg_row["avg_score"] if avg_row and avg_row["avg_score"] is not None else 0.0
            
            return {
                "total_alerts": total_count,
                "max_score": round(max_score, 4),
                "avg_score": round(avg_score, 4)
            }
    except Exception as e:
        ic(f"Error fetching stats: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.delete("/alerts")
async def clear_alerts():
    """Clear all alerts (admin operation)"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM high_risk_flows")
            cursor.execute("DELETE FROM sqlite_sequence WHERE name='high_risk_flows'")
            conn.commit()
            deleted_count = cursor.rowcount
            
            ic(f"Cleared {deleted_count} alerts from database")
            return {
                "status": "success",
                "message": f"Deleted all alerts",
                "deleted_count": deleted_count
            }
    except Exception as e:
        ic(f"Error clearing alerts: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    ic("Starting Vesper Insight API Server...")
    uvicorn.run(app, host="127.0.0.1", port=8888, log_level="info")
