import { PolicyLayout, PolicySection } from "@/components/layout/policy-layout";

export default function TermsOfServicePage() {
  return (
    <PolicyLayout title="Terms of Service">
      <PolicySection title="Acceptance of Terms">
        <p>
          By accessing or using The Hairport Salon website, you agree to these
          terms and our policies.
        </p>
      </PolicySection>
      <PolicySection title="Orders and Payments">
        <p>
          All orders are subject to acceptance and availability. Prices and
          offers may change without prior notice. Payment must be completed
          through supported gateways at checkout.
        </p>
      </PolicySection>
      <PolicySection title="Product Information">
        <p>
          We strive to display accurate product details and images. Minor
          variations may occur due to packaging updates or photography.
        </p>
      </PolicySection>
      <PolicySection title="Limitation of Liability">
        <p>
          We are not liable for indirect or consequential damages arising from
          use of the website or products, to the extent permitted by law.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}
