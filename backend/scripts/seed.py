import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.config import settings
from app.database import Database
from app.security import hash_password


async def seed(demo_password: str = "FarmAI@DevTest2026"):
    """
    Seeds comprehensive development and demo dataset conforming to Section 58 & 57:
    - 1 Farmer
    - 1 Buyer
    - 1 Farm
    - 2 Fields (Field 1: 0.75 acre, Field 2: 1.5 acre)
    - Field-level Soil Health data
    - 1 Cultivation
    - Multi-crop allocation (Tomato 0.50 acre + Chilli 0.15 acre + Beans 0.10 acre = 0.75 acre)
    - Tasks, Irrigation, Inputs, Expenses
    - Harvest record
    - Active produce listing
    - Buyer requirement
    """
    await Database.connect()
    db = Database.db
    now = datetime.now(timezone.utc)
    print("Connected to MongoDB. Starting database seeding...")

    # 1. Create Farmer
    farmer_doc = {
        "email": "farmer.dev@farmai.test",
        "full_name": "Ramesh Patel (Dev)",
        "password_hash": hash_password(demo_password),
        "role": "farmer",
        "status": "active",
        "gender": "male",
        "preferred_language": "en",
        "location": {
            "source": "manual",
            "state": "Maharashtra",
            "district": "Pune",
            "village": "Baramati",
            "address": "Gat No 142, Baramati, Pune",
        },
        "created_at": now,
        "updated_at": now,
    }
    await db.users.update_one({"email": farmer_doc["email"]}, {"$set": farmer_doc}, upsert=True)
    farmer = await db.users.find_one({"email": farmer_doc["email"]})
    farmer_id = str(farmer["_id"])

    # 2. Create Buyer
    buyer_doc = {
        "email": "buyer.dev@farmai.test",
        "full_name": "Kisan Mandi Buyer (Dev)",
        "business_name": "Fresh Harvest Agro Traders",
        "password_hash": hash_password(demo_password),
        "role": "buyer",
        "status": "active",
        "buyer_type": "wholesaler",
        "preferred_language": "en",
        "location": {
            "source": "manual",
            "state": "Maharashtra",
            "district": "Pune",
            "city": "Pune APMC",
        },
        "created_at": now,
        "updated_at": now,
    }
    await db.users.update_one({"email": buyer_doc["email"]}, {"$set": buyer_doc}, upsert=True)
    buyer = await db.users.find_one({"email": buyer_doc["email"]})
    buyer_id = str(buyer["_id"])

    # 3. Create Farm
    farm_doc = {
        "owner_id": farmer_id,
        "name": "Baramati Sunshine Farm",
        "farm_type": "irrigated",
        "land_status": "owned",
        "size": 2.25,
        "size_unit": "acre",
        "address": "Gat No 142, Baramati, Pune",
        "water_sources": ["borewell", "canal"],
        "notes": "Primary irrigated farmland with drip installation",
        "archived_at": None,
        "created_at": now,
        "updated_at": now,
    }
    farm_res = await db.farms.update_one({"owner_id": farmer_id, "name": farm_doc["name"]}, {"$set": farm_doc}, upsert=True)
    farm = await db.farms.find_one({"owner_id": farmer_id, "name": farm_doc["name"]})
    farm_id = str(farm["_id"])

    # 4. Create 2 Fields (Field 1: 0.75 acre, Field 2: 1.5 acre)
    field1_doc = {
        "owner_id": farmer_id,
        "farm_id": farm_id,
        "name": "North Plot (Multi-Crop 0.75 Acre)",
        "area": 0.75,
        "area_unit": "acre",
        "irrigation_source": "drip",
        "water_availability": "high",
        "soil_type": "clay_loam",
        "soil_ph": 6.8,
        "soil_nutrients": {"N": 90, "P": 45, "K": 50, "EC": 0.8, "organic_carbon": 0.65},
        "soil_test_source": "Soil Health Card",
        "soil_test_date": "2026-02-10",
        "archived_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.fields.update_one({"owner_id": farmer_id, "farm_id": farm_id, "name": field1_doc["name"]}, {"$set": field1_doc}, upsert=True)
    field1 = await db.fields.find_one({"owner_id": farmer_id, "name": field1_doc["name"]})
    field1_id = str(field1["_id"])

    field2_doc = {
        "owner_id": farmer_id,
        "farm_id": farm_id,
        "name": "South Plot (1.5 Acre)",
        "area": 1.5,
        "area_unit": "acre",
        "irrigation_source": "sprinkler",
        "water_availability": "medium",
        "soil_type": "sandy_loam",
        "soil_ph": 7.1,
        "archived_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.fields.update_one({"owner_id": farmer_id, "farm_id": farm_id, "name": field2_doc["name"]}, {"$set": field2_doc}, upsert=True)

    # 5. Create Cultivation (Kharif Multi-Crop)
    cult_doc = {
        "owner_id": farmer_id,
        "farm_id": farm_id,
        "field_id": field1_id,
        "name": "Kharif Multi-Crop 2026",
        "system_type": "mixed_cropping",
        "season": "kharif",
        "start_date": "2026-06-01",
        "status": "active",
        "notes": "Multi-crop allocation: Tomato 0.50 acre, Chilli 0.15 acre, Beans 0.10 acre = 0.75 acre",
        "created_at": now,
        "updated_at": now,
    }
    await db.cultivations.update_one({"owner_id": farmer_id, "field_id": field1_id, "name": cult_doc["name"]}, {"$set": cult_doc}, upsert=True)
    cult = await db.cultivations.find_one({"owner_id": farmer_id, "field_id": field1_id, "name": cult_doc["name"]})
    cult_id = str(cult["_id"])

    # 6. Create Crops in Field 1 (Tomato 0.50 + Chilli 0.15 + Beans 0.10 = 0.75 acre)
    crops_data = [
        {"crop_name": "Tomato", "variety": "Abhinav F1", "role": "primary", "area": 0.50, "growth_stage": "fruit_development"},
        {"crop_name": "Chilli", "variety": "G-4", "role": "intercrop", "area": 0.15, "growth_stage": "flowering"},
        {"crop_name": "Beans", "variety": "French Bush", "role": "companion", "area": 0.10, "growth_stage": "vegetative"},
    ]
    tomato_crop_id = None
    for c in crops_data:
        c_doc = {
            "owner_id": farmer_id,
            "farm_id": farm_id,
            "field_id": field1_id,
            "cultivation_id": cult_id,
            "crop_name": c["crop_name"],
            "variety": c["variety"],
            "role": c["role"],
            "area": c["area"],
            "area_unit": "acre",
            "planting_date": "2026-06-05",
            "expected_harvest_date": "2026-09-30",
            "growth_stage": c["growth_stage"],
            "status": "active",
            "health_status": "healthy",
            "created_at": now,
            "updated_at": now,
        }
        await db.crops.update_one({"owner_id": farmer_id, "cultivation_id": cult_id, "crop_name": c["crop_name"]}, {"$set": c_doc}, upsert=True)
        crop_record = await db.crops.find_one({"owner_id": farmer_id, "cultivation_id": cult_id, "crop_name": c["crop_name"]})
        if c["crop_name"] == "Tomato":
            tomato_crop_id = str(crop_record["_id"])

    # 7. Create Operations Records (Task, Irrigation, Input, Expense)
    task_doc = {
        "owner_id": farmer_id,
        "crop_id": tomato_crop_id,
        "field_id": field1_id,
        "title": "Foliar nutrient spray and pruning",
        "description": "Apply micronutrient mix to support heavy fruit development stage",
        "due_date": now,
        "priority": "important",
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    }
    await db.tasks.insert_one(task_doc)

    irrigation_doc = {
        "owner_id": farmer_id,
        "crop_id": tomato_crop_id,
        "field_id": field1_id,
        "date": "2026-09-20",
        "duration": 45,
        "method": "drip",
        "water_amount": 1500,
        "water_unit": "litres",
        "created_at": now,
        "updated_at": now,
    }
    await db.irrigation.insert_one(irrigation_doc)

    input_doc = {
        "owner_id": farmer_id,
        "crop_id": tomato_crop_id,
        "field_id": field1_id,
        "input_name": "Neem oil organic extract",
        "category": "pesticide",
        "quantity": 1.5,
        "unit": "litre",
        "reason": "Preventative sucking pest management",
        "created_at": now,
        "updated_at": now,
    }
    await db.inputs.insert_one(input_doc)

    expense_doc = {
        "owner_id": farmer_id,
        "crop_id": tomato_crop_id,
        "field_id": field1_id,
        "category": "fertilizer",
        "amount": 2400.0,
        "currency": "INR",
        "description": "Water soluble NPK 19:19:19 & Boron",
        "date": "2026-09-18",
        "created_at": now,
        "updated_at": now,
    }
    await db.expenses.insert_one(expense_doc)

    # 8. Create Harvest Record
    harvest_doc = {
        "owner_id": farmer_id,
        "crop_id": tomato_crop_id,
        "crop_cycle_id": tomato_crop_id,
        "date": "2026-09-22",
        "quantity": 500.0,
        "unit": "kg",
        "quality_grade": "A",
        "available_quantity": 200.0,
        "listed_quantity": 300.0,
        "reserved_quantity": 0.0,
        "sold_quantity": 0.0,
        "notes": "First picking — firm ripe red produce",
        "created_at": now,
        "updated_at": now,
    }
    harvest_res = await db.harvests.insert_one(harvest_doc)
    harvest_id = str(harvest_res.inserted_id)

    # 9. Create Produce Listing
    listing_doc = {
        "owner_id": farmer_id,
        "farmer_id": farmer_id,
        "harvest_id": harvest_id,
        "crop_name": "Tomato",
        "variety": "Abhinav F1",
        "quantity": 300.0,
        "remaining_quantity": 300.0,
        "reserved_quantity": 0.0,
        "sold_quantity": 0.0,
        "unit": "kg",
        "price_per_unit": 35.0,
        "expected_price": 35.0,
        "currency": "INR",
        "quality_grade": "A",
        "status": "active",
        "description": "Freshly harvested Grade-A farm fresh tomatoes available for bulk purchase.",
        "created_at": now,
        "updated_at": now,
    }
    await db.listings.insert_one(listing_doc)

    # 10. Create Buyer Requirement
    req_doc = {
        "owner_id": buyer_id,
        "buyer_id": buyer_id,
        "crop_name": "Tomato",
        "quantity": 200.0,
        "quantity_min": 100.0,
        "quantity_max": 300.0,
        "unit": "kg",
        "target_price": 38.0,
        "quality_grade": "A",
        "status": "active",
        "notes": "Urgent procurement for wholesale city distribution.",
        "created_at": now,
        "updated_at": now,
    }
    await db.requirements.insert_one(req_doc)

    await Database.close()
    print("Seed complete!")
    print(f"Farmer: farmer.dev@farmai.test / {demo_password}")
    print(f"Buyer: buyer.dev@farmai.test / {demo_password}")
    print("Created Farm: Baramati Sunshine Farm")
    print("Created Field 1: 0.75 Acre with Tomato (0.50 ac), Chilli (0.15 ac), Beans (0.10 ac)")
    print("Created Harvest: 500 kg Tomato")
    print("Created Listing: 300 kg Tomato @ Rs 35/kg")
    print("Created Buyer Requirement: 200 kg Tomato")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed FarmAI development data")
    parser.add_argument("--password", default=os.getenv("FARMAI_DEMO_PASSWORD", "FarmAI@DevTest2026"), help="Password for dev users")
    args = parser.parse_args()
    asyncio.run(seed(args.password))
