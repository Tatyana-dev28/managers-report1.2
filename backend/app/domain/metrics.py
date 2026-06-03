from dataclasses import dataclass


@dataclass(frozen=True)
class Metric:
    code: str
    title: str
    is_money: bool = False


METRICS: tuple[Metric, ...] = (
    Metric("meetings_held", "Кол-во проведенных встреч"),
    Metric("meetings_created", "Кол-во назначенных встреч"),
    Metric("calls_total", "Сумма дозвонов и звонков, входящих и исходящих"),
    Metric("outgoing_calls", "Кол-во исходящих дозвонов"),
    Metric("successful_outgoing_calls", "Кол-во исходящих успешных дозвонов"),
    Metric("incoming_calls", "Кол-во входящих звонков"),
    Metric("commercial_offers_sent", "Кол-во отправленных КП"),
    Metric("contracts_sent", "Кол-во отправленных договоров"),
    Metric("contracts_signed", "Кол-во подписанных договоров"),
    Metric("invoices_sent", "Кол-во отправленных счетов"),
    Metric("invoices_paid", "Кол-во оплаченных счетов"),
    Metric("new_deals", "Кол-во новых сделок"),
    Metric("successful_sale_deals", "Кол-во успешных сделок в воронке Продажа"),
    Metric("paid_invoice_sum", "Сумма оплаченных счетов", is_money=True),
)

METRIC_CODES: tuple[str, ...] = tuple(metric.code for metric in METRICS)
