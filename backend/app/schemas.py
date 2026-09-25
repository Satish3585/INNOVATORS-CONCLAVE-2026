from datetime import date, datetime
from enum import Enum
from typing import Any
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class Role(str, Enum):
    farmer = "farmer"
    buyer = "buyer"


class LocationSource(str, Enum):
    gps = "gps"
    manual = "manual"
    map = "map"
    farm = "farm"
    profile = "profile"


class Location(BaseModel):
    source: LocationSource
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, ge=0)
    captured_at: datetime | None = None
    state: str | None = None
    district: str | None = None
    taluka: str | None = None
    village: str | None = None
    city: str | None = None
    pincode: str | None = None
    address: str | None = None

    @model_validator(mode="after")
    def validate_capture(self):
        if self.source == LocationSource.gps and self.captured_at is None:
            raise ValueError("GPS locations require captured_at")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be supplied together")
        if self.source in {LocationSource.gps, LocationSource.map} and self.latitude is None:
            raise ValueError("GPS and map locations require coordinates")
        return self

    def as_geojson(self) -> dict[str, Any]:
        result = self.model_dump(mode="json", exclude_none=True)
        if self.latitude is not None and self.longitude is not None:
            result["coordinates"] = {"type": "Point", "coordinates": [self.longitude, self.latitude]}
        return result


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    role: Role = Role.farmer
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, max_length=40)
    phone: str | None = Field(default=None, max_length=32)
    preferred_language: str = "en"
    location: Location | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ProfilePatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    profile_photo_url: str | None = None
    phone: str | None = None
    gender: str | None = None
    date_of_birth: date | None = None
    preferred_language: str | None = None
    voice_language: str | None = None
    farming_experience_years: int | None = Field(default=None, ge=0, le=100)
    farmer_type: str | None = None
    business_name: str | None = Field(default=None, max_length=160)
    buyer_type: str | None = Field(default=None, max_length=80)
    preferred_crops: list[str] | None = None
    farming_interests: list[str] | None = None
    location: Location | None = None


class PreferencesPatch(BaseModel):
    units: str | None = None
    notification_channels: list[str] | None = None
    weather_location: str | None = None
    market_location: str | None = None
    language: str | None = None
    voice_language: str | None = None


class FarmCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    farm_type: str | None = None
    size: float | None = Field(default=None, gt=0)
    size_unit: str = "acre"
    location: Location | None = None
    address: str | None = None
    water_sources: list[str] = Field(default_factory=list)
    notes: str | None = None


class FieldCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    area: float = Field(gt=0)
    area_unit: str = "acre"
    soil_type: str | None = None
    soil_ph: float | None = Field(default=None, ge=0, le=14)
    soil_nutrients: dict[str, float] = Field(default_factory=dict)
    irrigation_method: str | None = None
    water_availability: str | None = None
    location: Location | None = None
    notes: str | None = None


class CultivationCreate(BaseModel):
    field_id: str
    name: str | None = None
    season: str | None = None
    start_date: date
    notes: str | None = None
    crops: list[dict[str, Any]] = Field(min_length=1)


class RecordCreate(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str | None = None
    crop_id: str | None = None
    cultivation_id: str | None = None
    field_id: str | None = None
    date: date | datetime | None = None
    due_date: date | datetime | None = None
    status: str | None = None
    notes: str | None = None


class TaskCreate(RecordCreate):
    title: str = Field(min_length=1, max_length=180)
    due_date: datetime
    priority: str = "normal"


class HealthCheckCreate(RecordCreate):
    crop_id: str
    symptoms: list[str] = Field(default_factory=list)
    image_url: str | None = None


class HarvestCreate(RecordCreate):
    crop_id: str
    quantity: float = Field(gt=0)
    unit: str = "kg"
    harvested_at: datetime | None = None
    date: str | None = None
    quality_grade: str | None = None
    notes: str | None = None


class ListingCreate(BaseModel):
    harvest_id: str
    crop_name: str
    variety: str | None = None
    quantity: float = Field(gt=0)
    unit: str = "kg"
    price_per_unit: float = Field(gt=0)
    currency: str = "INR"
    quality_grade: str | None = None
    available_from: datetime | None = None
    available_until: datetime | None = None
    location: Location | None = None
    description: str | None = None
    image_upload_id: str | None = None


class InterestCreate(BaseModel):
    quantity: float = Field(gt=0)
    message: str | None = None


class RequirementCreate(BaseModel):
    crop_name: str
    quantity: float | None = Field(default=None, gt=0)
    quantity_min: float | None = Field(default=None, gt=0)
    quantity_max: float | None = Field(default=None, gt=0)
    unit: str = "kg"
    target_price: float | None = Field(default=None, gt=0)
    quality_grade: str | None = None
    max_distance_km: float | None = Field(default=None, gt=0, le=1000)
    currency: str = "INR"
    needed_by: datetime | None = None
    location: Location | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_quantity_band(self):
        minimum = self.quantity_min or self.quantity
        if minimum is None:
            raise ValueError("Provide quantity or quantity_min")
        if self.quantity_max is not None and self.quantity_max < minimum:
            raise ValueError("quantity_max cannot be smaller than the minimum requested quantity")
        return self


class TransactionCreate(BaseModel):
    listing_id: str
    quantity: float = Field(gt=0)
    agreed_price_per_unit: float = Field(gt=0)
    currency: str = "INR"


class AIMessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    input_type: str = "text"
    crop_id: str | None = None
    field_id: str | None = None
    image_upload_id: str | None = None
    language: str | None = None


class AIConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=180)
    context: dict[str, Any] = Field(default_factory=dict)


class AIActionDecision(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    note: str | None = None


class AIActionCreate(BaseModel):
    action_type: str = Field(pattern="^(create_task|reschedule_task)$")
    title: str = Field(min_length=3, max_length=180)
    payload: dict[str, Any]


class SoilTestCreate(BaseModel):
    field_id: str
    test_date: date | None = None
    test_source: str = "manual"  # manual, lab_report, soil_health_card, field_kit, other
    document_upload_id: str | None = None
    soil_type: str | None = None
    ph: float | None = Field(default=None, ge=0, le=14)
    nitrogen: float | None = Field(default=None, ge=0)  # kg/ha
    phosphorus: float | None = Field(default=None, ge=0)  # kg/ha
    potassium: float | None = Field(default=None, ge=0)  # kg/ha
    electrical_conductivity: float | None = Field(default=None, ge=0)  # dS/m
    organic_carbon: float | None = Field(default=None, ge=0, le=100)  # %
    moisture_percentage: float | None = Field(default=None, ge=0, le=100)  # %
    sulfur: float | None = Field(default=None, ge=0)  # ppm / kg/ha
    zinc: float | None = Field(default=None, ge=0)  # ppm
    iron: float | None = Field(default=None, ge=0)  # ppm
    selected_crop: str | None = None
    growth_stage: str | None = None
    previous_crop: str | None = None
    notes: str | None = None
    extracted_from_report: bool = False
    verified_by_farmer: bool = True


class SoilExtractRequest(BaseModel):
    upload_id: str
    field_id: str | None = None


class SoilExplanationRequest(BaseModel):
    field_id: str | None = None
    soil_test_id: str | None = None
    ph: float | None = None
    nitrogen: float | None = None
    phosphorus: float | None = None
    potassium: float | None = None
    electrical_conductivity: float | None = None
    organic_carbon: float | None = None
    selected_crop: str | None = None
    growth_stage: str | None = None
    previous_crop: str | None = None


class DocumentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    doc_type: str = "soil_test_report"  # soil_test_report, crop_health_report, expert_report, soil_health_card, farm_document, invoice, other
    file_upload_id: str
    farm_id: str | None = None
    field_id: str | None = None
    crop_id: str | None = None
    notes: str | None = None
    status: str = "verified"


class DiseaseCheckRequest(BaseModel):
    image_upload_id: str
    crop_id: str | None = None
    field_id: str | None = None
    plant_name: str | None = None
    symptoms: list[str] = Field(default_factory=list)
    notes: str | None = None

