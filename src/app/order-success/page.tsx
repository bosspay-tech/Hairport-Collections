import { Suspense } from "react";
import OrderSuccessPage from "./order-success-content";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-200 border-t-rose-600" />
        </div>
      }
    >
      <OrderSuccessPage />
    </Suspense>
  );
}
