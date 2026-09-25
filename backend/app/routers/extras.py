from fastapi import APIRouter, Depends
from app.common import paginated, user_id
from app.database import get_db
from app.security import get_current_user

router = APIRouter()


@router.get("/audit-logs")
async def audit_logs(limit: int = 50, offset: int = 0, current=Depends(get_current_user), db=Depends(get_db)):
    return await paginated(db.audit_logs, {"actor_id": user_id(current)}, limit, offset, [("created_at", -1)])


@router.get("/performance")
async def performance_summary(current=Depends(get_current_user), db=Depends(get_db)):
    owner = user_id(current)
    harvests = await db.harvests.find({"owner_id": owner}).to_list(length=5000)
    expenses = await db.expenses.find({"owner_id": owner}).to_list(length=5000)
    txs = await db.transactions.find({"farmer_id": owner, "status": "completed"}).to_list(length=5000)
    harvested = sum(float(item.get("quantity") or 0) for item in harvests)
    harvested_value = sum(float(item.get("amount") or 0) for item in expenses if item.get("amount") is not None)
    revenue = sum(float(item.get("total_amount") or 0) for item in txs)
    sold_quantity = sum(float(item.get("quantity") or 0) for item in txs)
    return {"available": bool(harvests or expenses or txs), "harvested_quantity": harvested if harvests else None, "harvest_record_count": len(harvests), "expense_total": harvested_value if expenses else None, "completed_sales_revenue": revenue if txs else None, "sold_quantity": sold_quantity if txs else None, "profitability": None, "profitability_reason": "Profitability is not calculated unless consistently categorized cost and realized revenue data are available."}


@router.get("/ml/status")
async def ml_status():
    return {"available": False, "models": [], "reason": "No calibrated crop-yield, disease, or recommendation model is configured."}
