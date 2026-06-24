import { PolicyLayout, PolicySection } from "@/components/layout/policy-layout";

export default function ReturnsRefundsPage() {
  return (
    <PolicyLayout title="Returns & Refunds">
      <PolicySection title="Return Window">
        <p>
          You may request a return within 7 days of delivery for eligible
          products in unused and original condition.
        </p>
      </PolicySection>
      <PolicySection title="Refund Processing">
        <p>
          Approved refunds are processed within 5–7 business days to the original
          payment method once the returned item is received and inspected.
        </p>
      </PolicySection>
      <PolicySection title="Non-returnable Items">
        <p>
          Opened personal care products, clearance items, or products marked
          non-returnable may not be eligible for return.
        </p>
      </PolicySection>
      <PolicySection title="How to Initiate a Return">
        <p>
          Contact support@homeportcollections.com with your order ID and reason
          for return. Our team will guide you through the next steps.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}
