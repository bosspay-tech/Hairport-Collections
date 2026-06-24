import { PolicyLayout, PolicySection } from "@/components/layout/policy-layout";

export default function PrivacyPolicyPage() {
  return (
    <PolicyLayout title="Privacy Policy">
      <PolicySection title="Information We Collect">
        <p>
          We collect information you provide during account creation, checkout,
          and customer support interactions, including name, email, phone, and
          shipping address.
        </p>
      </PolicySection>
      <PolicySection title="How We Use Your Information">
        <p>
          Your information is used to process orders, provide support, improve
          our services, and communicate important updates related to your
          purchases.
        </p>
      </PolicySection>
      <PolicySection title="Data Security">
        <p>
          We use industry-standard safeguards to protect your personal
          information. Payment processing is handled through secure payment
          gateways.
        </p>
      </PolicySection>
      <PolicySection title="Contact">
        <p>
          For privacy-related questions, contact support@homeportcollections.com.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}
