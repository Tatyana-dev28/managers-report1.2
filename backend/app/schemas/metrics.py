from pydantic import BaseModel


class MetricRead(BaseModel):
    code: str
    title: str
    is_money: bool
