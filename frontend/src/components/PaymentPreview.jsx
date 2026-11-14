import { Wallet } from "lucide-react";
import "./PaymentPreview.css";

export const toFeeAmount = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

export const formatPeso = (amount) =>
  `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const buildPaymentPreviewRows = ({ residentFee, nonResidentFee, fee }) => {
  const singleFee = toFeeAmount(fee);
  const resident = toFeeAmount(residentFee);
  const nonResident = toFeeAmount(nonResidentFee);
  if (singleFee !== null) return [{ label: "Certificate fee", amount: singleFee }];
  if (resident !== null && nonResident !== null && resident === nonResident) {
    return [{ label: "Villanueva residents and non-residents", amount: resident }];
  }
  const rows = [];
  if (resident !== null) rows.push({ label: "Villanueva resident", amount: resident });
  if (nonResident !== null) rows.push({ label: "Non-resident (outside Villanueva)", amount: nonResident });
  return rows;
};

function PaymentPreview({ residentFee, nonResidentFee, fee }) {
  const rows = buildPaymentPreviewRows({ residentFee, nonResidentFee, fee });
  if (rows.length === 0) return null;

  return (
    <section className="payment-preview" aria-label="Payment preview">
      <header className="payment-preview-head">
        <span className="payment-preview-icon" aria-hidden="true">
          <Wallet size={18} strokeWidth={2} />
        </span>
        <div>
          <h4>Payment Preview</h4>
          <p>For your reference. The parish office confirms the final amount.</p>
        </div>
      </header>
      <ul className="payment-preview-rows">
        {rows.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <strong>{row.amount === 0 ? "Free" : formatPeso(row.amount)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default PaymentPreview;
