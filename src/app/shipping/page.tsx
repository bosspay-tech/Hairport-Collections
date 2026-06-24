import { PolicyLayout, PolicySection } from "@/components/layout/policy-layout";

export default function ShippingPolicyPage() {
  return (
    <PolicyLayout title="Shipping Policy">
      <PolicySection title="Shipping Locations">
        <p>
          We currently ship across India. If your location is not serviceable,
          you will be informed at checkout or during order confirmation.
        </p>
      </PolicySection>
      <PolicySection title="Order Processing">
        <p>
          Orders are usually processed within 24–48 hours (excluding Sundays and
          public holidays). During high-volume sale periods, processing may take
          longer.
        </p>
      </PolicySection>
      <PolicySection title="Delivery Timelines">
        <ul className="list-disc space-y-2 pl-5">
          <li>Metro cities: 2–5 business days</li>
          <li>Other cities/towns: 3–7 business days</li>
          <li>Remote locations: 5–10 business days</li>
        </ul>
      </PolicySection>
      <PolicySection title="Shipping Charges">
        <p>
          Free shipping on orders above ₹999. A flat shipping fee may apply below
          the threshold. Exact charges will be shown at checkout.
        </p>
      </PolicySection>
      <PolicySection title="Contact">
        <p>
          Questions about shipping? Email us at support@homeportcollections.com.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}
