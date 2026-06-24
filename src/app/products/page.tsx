import { Suspense } from "react";
import { ProductsContent } from "./products-content";

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-200 border-t-rose-600" />
        </div>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
