from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Portal(TimestampMixin, Base):
    __tablename__ = "portals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bitrix_domain: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    member_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    installed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    auth: Mapped["PortalAuth | None"] = relationship(
        back_populates="portal",
        cascade="all, delete-orphan",
    )
    users: Mapped[list["User"]] = relationship(back_populates="portal")
    settings: Mapped[list["PortalSetting"]] = relationship(back_populates="portal")


class PortalAuth(TimestampMixin, Base):
    __tablename__ = "portal_auth"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portal_id: Mapped[int] = mapped_column(ForeignKey("portals.id", ondelete="CASCADE"), nullable=False)
    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scope: Mapped[str | None] = mapped_column(Text, nullable=True)

    portal: Mapped["Portal"] = relationship(back_populates="auth")

    __table_args__ = (
        UniqueConstraint("portal_id", name="uq_portal_auth_portal_id"),
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portal_id: Mapped[int] = mapped_column(ForeignKey("portals.id", ondelete="CASCADE"), nullable=False)
    bitrix_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(32), default="manager", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    portal: Mapped["Portal"] = relationship(back_populates="users")
    submissions: Mapped[list["ManagerSubmission"]] = relationship(back_populates="user")
    system_snapshots: Mapped[list["SystemMetricSnapshot"]] = relationship(back_populates="user")
    reminder_logs: Mapped[list["ReminderLog"]] = relationship(back_populates="user")
    activity_logs: Mapped[list["UserActivityLog"]] = relationship(back_populates="user")
    plans: Mapped[list["MetricPlan"]] = relationship(
        foreign_keys="MetricPlan.user_id",
        back_populates="user",
    )

    __table_args__ = (
        UniqueConstraint("portal_id", "bitrix_user_id", name="uq_users_portal_bitrix_user"),
        Index("ix_users_portal_active", "portal_id", "is_active"),
    )


class ManagerSubmission(Base):
    __tablename__ = "manager_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portal_id: Mapped[int] = mapped_column(ForeignKey("portals.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    report_date: Mapped[date] = mapped_column(Date, nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    slot: Mapped[str] = mapped_column(String(32), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="submissions")
    values: Mapped[list["ManagerSubmissionValue"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("period_end > period_start", name="ck_manager_submissions_period_order"),
        CheckConstraint("slot IN ('morning', 'afternoon', 'evening')", name="ck_manager_submissions_slot"),
        Index("ix_manager_submissions_report", "portal_id", "user_id", "period_start", "period_end"),
        Index("ix_manager_submissions_date_slot", "portal_id", "report_date", "slot"),
    )


class ManagerSubmissionValue(Base):
    __tablename__ = "manager_submission_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("manager_submissions.id", ondelete="CASCADE"),
        nullable=False,
    )
    metric_code: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    submission: Mapped["ManagerSubmission"] = relationship(back_populates="values")

    __table_args__ = (
        CheckConstraint("value >= 0", name="ck_manager_submission_values_non_negative"),
        UniqueConstraint("submission_id", "metric_code", name="uq_manager_submission_metric"),
        Index("ix_manager_submission_values_metric", "metric_code"),
    )


class SystemMetricSnapshot(Base):
    __tablename__ = "system_metric_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portal_id: Mapped[int] = mapped_column(ForeignKey("portals.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    report_date: Mapped[date] = mapped_column(Date, nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="system_snapshots")
    values: Mapped[list["SystemMetricValue"]] = relationship(
        back_populates="snapshot",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("period_end > period_start", name="ck_system_snapshots_period_order"),
        UniqueConstraint(
            "portal_id",
            "user_id",
            "period_start",
            "period_end",
            name="uq_system_snapshot_period",
        ),
        Index("ix_system_snapshots_report", "portal_id", "user_id", "period_start", "period_end"),
        Index("ix_system_snapshots_date", "portal_id", "report_date"),
    )


class SystemMetricValue(Base):
    __tablename__ = "system_metric_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("system_metric_snapshots.id", ondelete="CASCADE"),
        nullable=False,
    )
    metric_code: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    snapshot: Mapped["SystemMetricSnapshot"] = relationship(back_populates="values")

    __table_args__ = (
        CheckConstraint("value >= 0", name="ck_system_metric_values_non_negative"),
        UniqueConstraint("snapshot_id", "metric_code", name="uq_system_snapshot_metric"),
        Index("ix_system_metric_values_metric", "metric_code"),
    )


class ReminderLog(Base):
    __tablename__ = "reminder_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portal_id: Mapped[int] = mapped_column(ForeignKey("portals.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    report_date: Mapped[date] = mapped_column(Date, nullable=False)
    slot: Mapped[str] = mapped_column(String(32), nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="reminder_logs")

    __table_args__ = (
        CheckConstraint("slot IN ('morning', 'afternoon', 'evening')", name="ck_reminder_logs_slot"),
        CheckConstraint("status IN ('sent', 'failed')", name="ck_reminder_logs_status"),
        Index("ix_reminder_logs_report", "portal_id", "user_id", "report_date", "slot"),
        Index("ix_reminder_logs_status", "portal_id", "status"),
    )


class UserActivityLog(Base):
    __tablename__ = "user_activity_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portal_id: Mapped[int] = mapped_column(ForeignKey("portals.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="activity_logs")

    __table_args__ = (
        Index("ix_user_activity_logs_opened", "portal_id", "user_id", "opened_at"),
    )


class PortalSetting(TimestampMixin, Base):
    __tablename__ = "portal_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portal_id: Mapped[int] = mapped_column(ForeignKey("portals.id", ondelete="CASCADE"), nullable=False)
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)

    portal: Mapped["Portal"] = relationship(back_populates="settings")

    __table_args__ = (
        UniqueConstraint("portal_id", "key", name="uq_portal_settings_key"),
    )


class MetricPlan(TimestampMixin, Base):
    __tablename__ = "metric_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portal_id: Mapped[int] = mapped_column(ForeignKey("portals.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    metric_code: Mapped[str] = mapped_column(String(100), nullable=False)
    plan_year: Mapped[int] = mapped_column(Integer, nullable=False)
    plan_month: Mapped[int] = mapped_column(Integer, nullable=False)
    daily_value: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    monthly_value: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    user: Mapped["User"] = relationship(
        foreign_keys=[user_id],
        back_populates="plans",
    )
    created_by_user: Mapped["User | None"] = relationship(foreign_keys=[created_by_user_id])

    __table_args__ = (
        CheckConstraint("plan_year >= 2000", name="ck_metric_plans_year"),
        CheckConstraint("plan_month BETWEEN 1 AND 12", name="ck_metric_plans_month"),
        CheckConstraint("daily_value >= 0", name="ck_metric_plans_daily_non_negative"),
        CheckConstraint("monthly_value >= 0", name="ck_metric_plans_monthly_non_negative"),
        UniqueConstraint(
            "portal_id",
            "user_id",
            "metric_code",
            "plan_year",
            "plan_month",
            name="uq_metric_plan_month",
        ),
        Index("ix_metric_plans_user_month", "portal_id", "user_id", "plan_year", "plan_month"),
        Index("ix_metric_plans_metric", "metric_code"),
    )
