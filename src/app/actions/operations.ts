"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/calc/ledger";
import { getDb } from "@/lib/db/client";
import { fNum, fStr, fTri } from "@/lib/forms";
import {
  addTransaction,
  createInventoryItem,
  createPurchaseOrder,
  createSupplier,
  deleteInventoryItem,
  deletePurchaseOrder,
  deleteSale,
  deleteSupplier,
  deleteTransaction,
  getSupplier,
  receivePurchaseOrder,
  recordSale,
  setPurchaseOrderStatus,
  updateInventoryItem,
  updateSupplier,
  type SupplierInput,
} from "@/lib/repo/operations";
import { setProductStatus } from "@/lib/repo/products";

const today = () => new Date().toISOString().slice(0, 10);
const int = (fd: FormData, k: string) => Math.max(0, Math.round(fNum(fd, k) ?? 0));

// ---------- inventory ----------

export async function createInventoryAction(fd: FormData) {
  const name = fStr(fd, "name");
  const unitCost = fNum(fd, "unitCost");
  if (!name || unitCost === null) redirect("/inventory?error=" + encodeURIComponent("Product name and unit cost are required."));
  const qty = int(fd, "qtyPurchased");
  const received = fd.get("qtyReceived") ? int(fd, "qtyReceived") : qty;
  const supplierId = fNum(fd, "supplierId");
  createInventoryItem(getDb(), {
    sku: fStr(fd, "sku") ?? `SKU-${Date.now().toString(36).toUpperCase()}`,
    asin: fStr(fd, "asin")?.toUpperCase() ?? null,
    name,
    brand: fStr(fd, "brand"),
    supplierId,
    supplierName: supplierId ? getSupplier(getDb(), supplierId)?.name ?? null : fStr(fd, "supplierName"),
    purchaseDate: fStr(fd, "purchaseDate") ?? today(),
    unitCost,
    qtyPurchased: qty,
    qtyReceived: received,
    qtySent: int(fd, "qtySent"),
    salePrice: fNum(fd, "salePrice"),
    feesPerUnit: fNum(fd, "feesPerUnit"),
    shippingPerUnit: fNum(fd, "shippingPerUnit") ?? 0,
    prepPerUnit: fNum(fd, "prepPerUnit") ?? 0,
    storageLocation: fStr(fd, "storageLocation"),
    expirationDate: fStr(fd, "expirationDate"),
    lot: fStr(fd, "lot"),
    notes: fStr(fd, "notes"),
    receivedAt: received > 0 ? fStr(fd, "purchaseDate") ?? today() : null,
  });
  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function updateQuantitiesAction(id: number, fd: FormData) {
  updateInventoryItem(getDb(), id, {
    qtyReceived: int(fd, "qtyReceived"),
    qtySent: int(fd, "qtySent"),
    salePrice: fNum(fd, "salePrice"),
    feesPerUnit: fNum(fd, "feesPerUnit"),
    storageLocation: fStr(fd, "storageLocation"),
  });
  revalidatePath("/inventory");
}

export async function recordSaleAction(id: number, fd: FormData) {
  const qty = int(fd, "qty");
  const price = fNum(fd, "salePrice");
  if (qty <= 0 || price === null) return;
  recordSale(getDb(), {
    inventoryId: id,
    date: fStr(fd, "date") ?? today(),
    qty,
    salePrice: price,
    fees: fNum(fd, "fees") ?? 0,
    notes: fStr(fd, "notes"),
  });
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function deleteSaleAction(id: number) {
  deleteSale(getDb(), id);
  revalidatePath("/inventory");
  revalidatePath("/sales-intelligence");
}

export async function deleteInventoryAction(id: number) {
  deleteInventoryItem(getDb(), id);
  revalidatePath("/inventory");
}

// ---------- purchase orders ----------

export async function createPurchaseOrderAction(fd: FormData) {
  const supplierId = fNum(fd, "supplierId");
  const supplierName = supplierId ? getSupplier(getDb(), supplierId)?.name : fStr(fd, "supplierName");
  const lines = [];
  for (let i = 0; i < 20; i++) {
    const product = fStr(fd, `line${i}_product`);
    const quantity = fNum(fd, `line${i}_quantity`);
    const unitCost = fNum(fd, `line${i}_unitCost`);
    if (!product || !quantity || unitCost === null) continue;
    lines.push({
      product,
      sku: fStr(fd, `line${i}_sku`),
      asin: fStr(fd, `line${i}_asin`)?.toUpperCase() ?? null,
      quantity: Math.round(quantity),
      unitCost,
      expectedSalePrice: fNum(fd, `line${i}_expectedSalePrice`),
      expectedFeesPerUnit: fNum(fd, `line${i}_expectedFeesPerUnit`),
    });
  }
  if (!supplierName || lines.length === 0)
    redirect("/purchase-orders/new?error=" + encodeURIComponent("A supplier and at least one complete line (product, quantity, unit cost) are required."));
  const id = createPurchaseOrder(getDb(), {
    poNumber: fStr(fd, "poNumber") ?? undefined,
    supplierId,
    supplierName,
    date: fStr(fd, "date") ?? today(),
    shipping: fNum(fd, "shipping") ?? 0,
    otherCosts: fNum(fd, "otherCosts") ?? 0,
    notes: fStr(fd, "notes"),
    lines,
  });
  const productId = fNum(fd, "productId");
  if (productId) setProductStatus(getDb(), productId, "purchased");
  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders/${id}`);
}

export async function setPoStatusAction(id: number, status: string) {
  if (status === "received") receivePurchaseOrder(getDb(), id);
  else setPurchaseOrderStatus(getDb(), id, status);
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/inventory");
  revalidatePath("/cash-flow");
}

export async function deletePoAction(id: number) {
  deletePurchaseOrder(getDb(), id);
  revalidatePath("/purchase-orders");
  redirect("/purchase-orders");
}

// ---------- suppliers ----------

function supplierFromForm(fd: FormData): SupplierInput {
  return {
    name: fStr(fd, "name") ?? "",
    website: fStr(fd, "website"),
    contact: fStr(fd, "contact"),
    location: fStr(fd, "location"),
    products: fStr(fd, "products"),
    moq: fStr(fd, "moq"),
    pricing: fStr(fd, "pricing"),
    shippingTerms: fStr(fd, "shippingTerms"),
    paymentTerms: fStr(fd, "paymentTerms"),
    leadTimeDays: fNum(fd, "leadTimeDays"),
    returnPolicy: fStr(fd, "returnPolicy"),
    invoiceAvailable: fTri(fd, "invoiceAvailable"),
    authorizationStatus: fStr(fd, "authorizationStatus") ?? "unknown",
    reliabilityNotes: fStr(fd, "reliabilityNotes"),
    lastOrderDate: fStr(fd, "lastOrderDate"),
    lastPrice: fNum(fd, "lastPrice"),
    currentPrice: fNum(fd, "currentPrice"),
  };
}

export async function saveSupplierAction(fd: FormData) {
  const s = supplierFromForm(fd);
  if (!s.name) redirect("/suppliers?error=" + encodeURIComponent("Supplier name is required."));
  const id = fNum(fd, "id");
  if (id) updateSupplier(getDb(), id, s);
  else createSupplier(getDb(), s);
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

export async function deleteSupplierAction(id: number) {
  deleteSupplier(getDb(), id);
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

// ---------- transactions ----------

export async function addTransactionAction(fd: FormData) {
  const type = fStr(fd, "type") as TransactionType | null;
  const amount = fNum(fd, "amount");
  if (!type || !TRANSACTION_TYPES.includes(type) || amount === null || amount === 0) {
    redirect("/cash-flow?error=" + encodeURIComponent("Type and a non-zero amount are required."));
  }
  addTransaction(getDb(), { date: fStr(fd, "date") ?? today(), type, amount, description: fStr(fd, "description") });
  revalidatePath("/cash-flow");
  revalidatePath("/dashboard");
}

export async function deleteTransactionAction(id: number) {
  deleteTransaction(getDb(), id);
  revalidatePath("/cash-flow");
  revalidatePath("/dashboard");
}
