import io
from pathlib import Path
from pypdf import PdfWriter
import pytest
from app.services.soil_service import extract_soil_report, generate_soil_explanation, parse_soil_parameters, compare_soil_tests
from app.services.ml.disease_detector import disease_detector


def create_sample_soil_pdf() -> bytes:
    """Generates an in-memory sample soil test report PDF for testing."""
    from pypdf import PdfWriter
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    # Add annotation or text
    buf = io.BytesIO()
    writer.write(buf)
    # Generate a simple valid PDF with standard text stream
    pdf_content = (
        b"%PDF-1.4\n"
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >> endobj\n"
        b"4 0 obj << /Length 280 >> stream\n"
        b"BT\n"
        b"/F1 12 Tf\n"
        b"72 712 Td\n"
        b"(GOVERNMENT OF MAHARASHTRA - SOIL HEALTH CARD) Tj\n"
        b"0 -24 Td\n"
        b"(Soil pH : 6.8) Tj\n"
        b"0 -18 Td\n"
        b"(Available Nitrogen (N) : 240.0 kg/ha) Tj\n"
        b"0 -18 Td\n"
        b"(Available Phosphorus (P) : 35.0 kg/ha) Tj\n"
        b"0 -18 Td\n"
        b"(Available Potassium (K) : 180.0 kg/ha) Tj\n"
        b"0 -18 Td\n"
        b"(Organic Carbon (OC) : 0.72 %) Tj\n"
        b"0 -18 Td\n"
        b"(Electrical Conductivity (EC) : 0.45 dS/m) Tj\n"
        b"0 -18 Td\n"
        b"(Date of Test : 2026-09-20) Tj\n"
        b"ET\n"
        b"endstream\n"
        b"endobj\n"
        b"xref\n"
        b"0 5\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"0000000219 00000 n \n"
        b"trailer << /Size 5 /Root 1 0 R >>\n"
        b"startxref\n"
        b"550\n"
        b"%%EOF\n"
    )
    return pdf_content


def test_soil_parameter_parsing_from_text():
    sample_text = """
    District Soil Testing Laboratory - Baramati
    Sample No: 2026/09/ST-412
    Farmer Name: Ramesh Patel
    Soil pH: 6.8
    Available Nitrogen: 240 kg/ha
    Available Phosphorus: 35 kg/ha
    Available Potassium: 180 kg/ha
    Organic Carbon: 0.72 %
    Electrical Conductivity: 0.45 dS/m
    Soil Moisture: 18.5 %
    Date of Test: 2026-09-20
    Soil Type: Red Loam
    """
    res = parse_soil_parameters(sample_text)
    vals = res["extracted_values"]
    assert vals["ph"] == 6.8
    assert vals["nitrogen"] == 240.0
    assert vals["phosphorus"] == 35.0
    assert vals["potassium"] == 180.0
    assert vals["organic_carbon"] == 0.72
    assert vals["electrical_conductivity"] == 0.45
    assert vals["moisture_percentage"] == 18.5
    assert vals["test_date"] == "2026-09-20"
    assert "Red Loam" in vals["soil_type"]


def test_soil_explanation_generation():
    soil_data = {
        "ph": 6.8,
        "nitrogen": 240.0,
        "phosphorus": 35.0,
        "potassium": 180.0,
        "organic_carbon": 0.72,
        "electrical_conductivity": 0.45,
    }
    explanation = generate_soil_explanation(
        soil_data=soil_data,
        crop_name="tomato",
        growth_stage="flowering",
        previous_crop="chickpea",
    )
    assert explanation["overall_health"] in {"Excellent", "Good — Minor Attention Needed"}
    assert "ph" in explanation["parameters"]
    assert "nitrogen" in explanation["parameters"]
    assert "phosphorus" in explanation["parameters"]
    assert "potassium" in explanation["parameters"]
    assert "organic_carbon" in explanation["parameters"]
    assert "electrical_conductivity" in explanation["parameters"]
    assert any("tomato" in s.lower() for s in explanation["context_notes"])
    assert any("chickpea" in s.lower() for s in explanation["context_notes"])


def test_soil_history_trend_comparison():
    tests = [
        {"test_date": "2025-03-10", "ph": 6.4, "nitrogen": 210.0, "phosphorus": 28.0, "potassium": 160.0},
        {"test_date": "2026-09-20", "ph": 6.8, "nitrogen": 240.0, "phosphorus": 35.0, "potassium": 180.0},
    ]
    comparison = compare_soil_tests(tests)
    assert comparison["comparison_available"] is True
    assert comparison["test_count"] == 2
    assert comparison["trends"]["ph"]["change"] == 0.4
    assert comparison["trends"]["ph"]["direction"] == "increased"
    assert comparison["trends"]["nitrogen"]["change"] == 30.0


def test_disease_detector_availability_and_health():
    assert disease_detector.is_available is True
    status = disease_detector.get_status()
    assert status["status"] == "loaded"
    assert status["classes_count"] == 38
    assert status["architecture"] == "ResNet9"


def test_soil_and_document_api_flow(client):
    # 1. Register two farmers to test ownership isolation
    r1 = client.post("/api/auth/register", json={"full_name": "Farmer Alpha", "email": "alpha-soil@example.com", "password": "long-test-passphrase", "role": "farmer"})
    r2 = client.post("/api/auth/register", json={"full_name": "Farmer Beta", "email": "beta-soil@example.com", "password": "long-test-passphrase", "role": "farmer"})
    assert r1.status_code == r2.status_code == 201

    token_a = client.post("/api/auth/login", json={"email": "alpha-soil@example.com", "password": "long-test-passphrase"}).json()["access_token"]
    token_b = client.post("/api/auth/login", json={"email": "beta-soil@example.com", "password": "long-test-passphrase"}).json()["access_token"]
    h_a = {"Authorization": f"Bearer {token_a}"}
    h_b = {"Authorization": f"Bearer {token_b}"}

    # 2. Farmer Alpha creates farm and field
    farm = client.post("/api/farms", headers=h_a, json={"name": "Alpha Organic Farm", "size": 3.5}).json()
    field = client.post(f"/api/farms/{farm['id']}/fields", headers=h_a, json={"name": "Plot 1 East", "area": 2.0, "soil_type": "Clay Loam"}).json()

    # 3. Farmer Alpha manually logs Soil Test
    soil_res = client.post(
        "/api/soil-tests",
        headers=h_a,
        json={
            "field_id": field["id"],
            "test_date": "2026-09-20",
            "test_source": "manual",
            "ph": 6.8,
            "nitrogen": 240.0,
            "phosphorus": 35.0,
            "potassium": 180.0,
            "organic_carbon": 0.72,
            "electrical_conductivity": 0.45,
            "selected_crop": "Tomato",
            "growth_stage": "flowering",
            "previous_crop": "Chickpea",
        },
    )
    assert soil_res.status_code == 201
    soil_test = soil_res.json()
    assert soil_test["ph"] == 6.8
    assert soil_test["explanation"]["overall_health"] in {"Excellent", "Good — Minor Attention Needed"}

    # 4. Verify Farmer Beta cannot access Farmer Alpha's soil test (Security & Isolation)
    forbidden_get = client.get(f"/api/soil-tests/{soil_test['id']}", headers=h_b)
    assert forbidden_get.status_code in {403, 404}

    # 5. List soil tests for field
    list_res = client.get(f"/api/soil-tests?field_id={field['id']}", headers=h_a)
    assert list_res.status_code == 200
    assert len(list_res.json()["items"]) >= 1

    # 6. Test PDF upload and extraction
    pdf_bytes = create_sample_soil_pdf()
    files = {"file": ("soil_report.pdf", pdf_bytes, "application/pdf")}
    upload_res = client.post("/api/uploads", headers=h_a, files=files)
    assert upload_res.status_code == 201
    upload_id = upload_res.json()["upload_id"]

    extract_res = client.post("/api/soil-tests/extract", headers=h_a, json={"upload_id": upload_id})
    assert extract_res.status_code == 200
    extract_data = extract_res.json()
    assert extract_data["upload_id"] == upload_id
    assert extract_data["status"] in {"extracted", "manual_entry_required", "partial_text_found"}

    # 7. Document Center test
    doc_res = client.post(
        "/api/documents",
        headers=h_a,
        json={
            "name": "Official Soil Health Card 2026",
            "doc_type": "soil_health_card",
            "file_upload_id": upload_id,
            "farm_id": farm["id"],
            "field_id": field["id"],
            "notes": "Verified by state agriculture lab.",
        },
    )
    assert doc_res.status_code == 201
    doc_id = doc_res.json()["id"]

    # Beta cannot view Alpha's document
    assert client.get(f"/api/documents/{doc_id}", headers=h_b).status_code in {403, 404}

    # Alpha lists documents
    docs_list = client.get("/api/documents", headers=h_a).json()
    assert docs_list["total"] >= 1

    # 8. Soil History
    history_res = client.get(f"/api/soil-tests/history/{field['id']}", headers=h_a)
    assert history_res.status_code == 200
    assert len(history_res.json()["tests"]) >= 1

    # 9. Disease detection upload & CV diagnosis test
    from PIL import Image
    img = Image.new("RGB", (256, 256), color=(40, 160, 40))
    img_buf = io.BytesIO()
    img.save(img_buf, format="JPEG")
    img_bytes = img_buf.getvalue()

    img_upload = client.post("/api/uploads", headers=h_a, files={"file": ("leaf.jpg", img_bytes, "image/jpeg")})
    assert img_upload.status_code == 201
    leaf_upload_id = img_upload.json()["upload_id"]

    # Run disease check endpoint
    disease_check = client.post(
        "/api/agriculture/disease-check",
        headers=h_a,
        json={
            "image_upload_id": leaf_upload_id,
            "field_id": field["id"],
            "plant_name": "Tomato",
            "symptoms": ["yellow spots", "curling margins"],
        },
    )
    assert disease_check.status_code == 201
    check_data = disease_check.json()
    assert check_data["image_upload_id"] == leaf_upload_id
    assert check_data["diagnosis_status"] in {"diagnosed", "uncertain", "analysis_failed"}
    assert "recommended_next_steps" in check_data
    assert len(check_data["recommended_next_steps"]) > 0

    # Verify disease history endpoint returns this check
    disease_history = client.get(f"/api/agriculture/disease-history?field_id={field['id']}", headers=h_a)
    assert disease_history.status_code == 200
    assert len(disease_history.json()["items"]) >= 1

