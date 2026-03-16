import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCartStore } from "../store/cart.store";
import { STORE_ID } from "../config/store";
import { useAuth } from "../features/auth/useAuth";
import { submitPaymentForm } from "sabpaisa-pg-dev";
const clientCode = import.meta.env.VITE_SABPAISA_CLIENT_CODE;
const transUserName = import.meta.env.VITE_SABPAISA_USERNAME;
const transUserPassword = import.meta.env.VITE_SABPAISA_PASSWORD;
const authKey = import.meta.env.VITE_SABPAISA_AUTHENTICATION_KEY;
const authIV = import.meta.env.VITE_SABPAISA_AUTHENTICATION_IV;
function formatMoney(n) {
  const num = Number(n || 0);
  return `₹${num.toFixed(0)}`;
}
const generateTxnId = () => {
  return "TXN_" + Date.now();
};
const defaultValues = {
  clientCode: clientCode || "XXXXX",
  transUserName: transUserName || "XXXXXX",
  transUserPassword: transUserPassword || "XXXXXXXX",
  authKey: authKey || "XXXXXXXXXXXXXXXXXXXXXXX",
  authIV: authIV || "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  payerName: "",
  payerEmail: "",
  payerMobile: "",
  amount: 0,
  amountType: "INR",
  clientTxnId: "",
  channelId: "npm",
  udf1: null,
  udf2: null,
  udf3: null,
  udf4: null,
  udf5: null,
  udf6: null,
  udf7: null,
  udf8: null,
  udf9: null,
  udf10: null,
  udf11: null,
  udf12: null,
  udf13: null,
  udf14: null,
  udf15: null,
  udf16: null,
  udf17: null,
  udf18: null,
  udf19: null,
  udf20: null,
  env: import.meta.env.VITE_SABPAISA_ENV,
  callbackUrl: `${window.location.origin}/order-success`,
};
export default function Checkout() {
  const [formState, setFormState] = useState(defaultValues);
  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });
  const { items, total } = useCartStore();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const subtotal = useMemo(() => Number(total()), [total]);
  const totalItems = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.quantity || 0), 0),
    [items],
  );
  useEffect(() => {
    if (!user) return;
    setCustomer((prev) => ({
      ...prev,
      name: user?.user_metadata?.full_name || prev.name,
      email: user?.email || prev.email,
      phone: user?.phone || prev.phone,
      address: user?.user_metadata?.address || prev.address,
      city: user?.user_metadata?.city || prev.city,
      state: user?.user_metadata?.state || prev.state,
      pincode: user?.user_metadata?.pincode || prev.pincode,
    }));
    setFormState((prev) => ({
      ...prev,
      payerName: user?.user_metadata?.full_name || prev.payerName,
      payerEmail: user?.email || prev.payerEmail,
      payerMobile: user?.phone || prev.payerMobile,
    }));
  }, [user]);
  const handleCustomerChange = (e) => {
    const { name, value } = e.target;
    setCustomer((prev) => ({ ...prev, [name]: value }));
    if (name === "name") {
      setFormState((prev) => ({ ...prev, payerName: value }));
    }
    if (name === "email") {
      setFormState((prev) => ({ ...prev, payerEmail: value }));
    }
    if (name === "phone") {
      setFormState((prev) => ({ ...prev, payerMobile: value }));
    }
  };
  const validateForm = () => {
    if (!customer.name.trim()) return "Please enter full name.";
    if (!customer.email.trim()) return "Please enter email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      return "Please enter a valid email address.";
    }
    if (!customer.phone.trim()) return "Please enter phone number.";
    if (!/^\d{10}$/.test(customer.phone)) {
      return "Please enter a valid 10-digit phone number.";
    }
    if (!customer.address.trim()) return "Please enter address.";
    if (!customer.city.trim()) return "Please enter city.";
    if (!customer.state.trim()) return "Please enter state.";
    if (!customer.pincode.trim()) return "Please enter pincode.";
    if (!/^\d{6}$/.test(customer.pincode)) {
      return "Please enter a valid 6-digit pincode.";
    }
    return "";
  };
  const handleSubmit = async () => {
    try {
      setError("");
      const validationError = validateForm();
      if (validationError) {
        setError(validationError);
        return;
      }
      setLoading(true);
      const txnId = generateTxnId();
      await createOrder(txnId);
      const paymentData = {
        ...formState,
        payerName: customer.name,
        payerEmail: customer.email,
        payerMobile: customer.phone,
        amount: subtotal,
        clientTxnId: txnId,
        udf1: customer.address,
        udf2: customer.city,
        udf3: customer.state,
        udf4: customer.pincode,
      };
      submitPaymentForm(paymentData);
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setLoading(false);
    }
  };
  const createOrder = async (txnId) => {
    const { error } = await supabase.from("orders").insert({
      store_id: STORE_ID,
      user_id: user?.id || null,
      items,
      total: subtotal,
      transaction_id: txnId,
      status: "pending",
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      customer_address: customer.address,
      customer_city: customer.city,
      customer_state: customer.state,
      customer_pincode: customer.pincode,
    });
    if (error) {
      throw new Error(error.message);
    }
  };
  if (!items?.length) {
    return (
      <div className="min-h-[70vh] bg-linear-to-b from-slate-50 to-white flex items-center justify-center px-4 py-12">
        {" "}
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          {" "}
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
            {" "}
            🧺{" "}
          </div>{" "}
          <h2 className="text-xl font-bold text-slate-900">
            {" "}
            Your cart is empty{" "}
          </h2>{" "}
          <p className="mt-2 text-sm text-slate-600">
            {" "}
            Add items to your cart to proceed to checkout.{" "}
          </p>{" "}
          <Link
            to="/products"
            className="mt-6 inline-flex rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            {" "}
            Browse products{" "}
          </Link>{" "}
        </div>{" "}
      </div>
    );
  }
  return (
    <div className="min-h-[70vh] bg-linear-to-b from-slate-50 to-white">
      {" "}
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {" "}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          {" "}
          <div>
            {" "}
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {" "}
              Checkout{" "}
            </h2>{" "}
            <p className="mt-1 text-sm text-slate-600">
              {" "}
              Review your items, add customer details and place your order.{" "}
            </p>{" "}
          </div>{" "}
          <div className="flex flex-wrap gap-2">
            {" "}
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm">
              {" "}
              <span className="text-slate-500">Items:</span>{" "}
              <span className="font-semibold text-slate-900">
                {totalItems}
              </span>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm">
              {" "}
              <span className="text-slate-500">Total:</span>{" "}
              <span className="font-semibold text-slate-900">
                {" "}
                {formatMoney(subtotal)}{" "}
              </span>{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
        {!user ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {" "}
            You’re placing this order as a{" "}
            <span className="font-semibold">guest</span>.{" "}
            <span className="ml-2 text-amber-700">
              {" "}
              (Optional) Login to track orders more easily.{" "}
            </span>{" "}
          </div>
        ) : null}{" "}
        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {" "}
            {error}{" "}
          </div>
        ) : null}{" "}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {" "}
          <div className="space-y-6 lg:col-span-2">
            {" "}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {" "}
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                {" "}
                <h3 className="text-sm font-semibold text-slate-900">
                  {" "}
                  Customer Details{" "}
                </h3>{" "}
                <p className="mt-1 text-xs text-slate-500">
                  {" "}
                  Please enter billing / shipping information.{" "}
                </p>{" "}
              </div>{" "}
              <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
                {" "}
                <div className="sm:col-span-2">
                  {" "}
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {" "}
                    Full Name{" "}
                  </label>{" "}
                  <input
                    type="text"
                    name="name"
                    value={customer.name}
                    onChange={handleCustomerChange}
                    placeholder="Enter full name"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />{" "}
                </div>{" "}
                <div>
                  {" "}
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {" "}
                    Email{" "}
                  </label>{" "}
                  <input
                    type="email"
                    name="email"
                    value={customer.email}
                    onChange={handleCustomerChange}
                    placeholder="Enter email"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />{" "}
                </div>{" "}
                <div>
                  {" "}
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {" "}
                    Phone Number{" "}
                  </label>{" "}
                  <input
                    type="tel"
                    name="phone"
                    value={customer.phone}
                    onChange={handleCustomerChange}
                    placeholder="Enter phone number"
                    maxLength={10}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />{" "}
                </div>{" "}
                <div className="sm:col-span-2">
                  {" "}
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {" "}
                    Address{" "}
                  </label>{" "}
                  <textarea
                    name="address"
                    value={customer.address}
                    onChange={handleCustomerChange}
                    placeholder="House no, street, area"
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />{" "}
                </div>{" "}
                <div>
                  {" "}
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {" "}
                    City{" "}
                  </label>{" "}
                  <input
                    type="text"
                    name="city"
                    value={customer.city}
                    onChange={handleCustomerChange}
                    placeholder="Enter city"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />{" "}
                </div>{" "}
                <div>
                  {" "}
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {" "}
                    State{" "}
                  </label>{" "}
                  <input
                    type="text"
                    name="state"
                    value={customer.state}
                    onChange={handleCustomerChange}
                    placeholder="Enter state"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />{" "}
                </div>{" "}
                <div>
                  {" "}
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {" "}
                    Pincode{" "}
                  </label>{" "}
                  <input
                    type="text"
                    name="pincode"
                    value={customer.pincode}
                    onChange={handleCustomerChange}
                    placeholder="Enter pincode"
                    maxLength={6}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />{" "}
                </div>{" "}
              </div>{" "}
            </div>{" "}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {" "}
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                {" "}
                <h3 className="text-sm font-semibold text-slate-900">
                  {" "}
                  Order Summary{" "}
                </h3>{" "}
                <p className="mt-1 text-xs text-slate-500">
                  {" "}
                  Confirm quantities and variant selections.{" "}
                </p>{" "}
              </div>{" "}
              <div className="px-5 py-4">
                {" "}
                <div className="space-y-3">
                  {" "}
                  {items.map((item, i) => {
                    const qty = Number(item.quantity || 0);
                    const line = Number(item.price || 0) * qty;
                    return (
                      <div
                        key={`${item.productId || item.title}-${item.variantSku || ""}-${i}`}
                        className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3"
                      >
                        {" "}
                        <div className="min-w-0">
                          {" "}
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {" "}
                            {item.title}{" "}
                          </p>{" "}
                          {item.variantLabel ? (
                            <p className="mt-0.5 text-xs text-slate-500">
                              {" "}
                              {item.variantLabel}{" "}
                            </p>
                          ) : null}{" "}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            {" "}
                            <span className="rounded-full bg-slate-100 px-3 py-1">
                              {" "}
                              Qty: {qty}{" "}
                            </span>{" "}
                            <span className="rounded-full bg-slate-100 px-3 py-1">
                              {" "}
                              Each: {formatMoney(item.price)}{" "}
                            </span>{" "}
                          </div>{" "}
                        </div>{" "}
                        <div className="shrink-0 text-right">
                          {" "}
                          <p className="text-sm font-bold text-slate-900">
                            {" "}
                            {formatMoney(line)}{" "}
                          </p>{" "}
                          <p className="mt-0.5 text-xs text-slate-500">
                            {" "}
                            Line total{" "}
                          </p>{" "}
                        </div>{" "}
                      </div>
                    );
                  })}{" "}
                </div>{" "}
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  {" "}
                  <div className="flex items-center justify-between text-sm text-slate-700">
                    {" "}
                    <span>Subtotal</span>{" "}
                    <span className="font-semibold text-slate-900">
                      {" "}
                      {formatMoney(subtotal)}{" "}
                    </span>{" "}
                  </div>{" "}
                  <div className="mt-2 flex items-center justify-between text-sm text-slate-700">
                    {" "}
                    <span>Shipping</span>{" "}
                    <span className="text-slate-500">
                      Calculated later
                    </span>{" "}
                  </div>{" "}
                  <div className="my-3 h-px bg-slate-200" />{" "}
                  <div className="flex items-center justify-between">
                    {" "}
                    <span className="text-sm font-semibold text-slate-900">
                      {" "}
                      Total{" "}
                    </span>{" "}
                    <span className="text-lg font-extrabold text-slate-900">
                      {" "}
                      {formatMoney(subtotal)}{" "}
                    </span>{" "}
                  </div>{" "}
                </div>{" "}
                <div className="mt-4">
                  {" "}
                  <Link
                    to="/cart"
                    className="text-sm font-semibold text-slate-900 hover:underline"
                  >
                    {" "}
                    ← Edit cart{" "}
                  </Link>{" "}
                </div>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
          <div className="lg:col-span-1">
            {" "}
            <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {" "}
              <h3 className="text-sm font-semibold text-slate-900">
                {" "}
                Place your order{" "}
              </h3>{" "}
              <p className="mt-1 text-xs text-slate-500">
                {" "}
                By placing the order you agree to our policies.{" "}
              </p>{" "}
              <button
                onClick={handleSubmit}
                disabled={loading}
                className={[
                  "mt-5 w-full rounded-xl py-3 text-sm font-semibold transition",
                  "focus:outline-none focus:ring-4",
                  loading
                    ? "cursor-not-allowed bg-slate-200 text-slate-500"
                    : "bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-200",
                ].join(" ")}
              >
                {" "}
                {loading
                  ? "Placing order..."
                  : `Place Order • ${formatMoney(subtotal)}`}{" "}
              </button>{" "}
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                {" "}
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {" "}
                  🔒 Secure payments{" "}
                </span>{" "}
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {" "}
                  📦 Packed soon{" "}
                </span>{" "}
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {" "}
                  ↩️ Easy returns{" "}
                </span>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
