"""
Run this script once to build the SQLite database from the raw dataset.

Usage:
    python build_db.py --data-dir /path/to/sap-o2c-data

The data directory should contain subfolders like:
  sales_order_headers/, billing_document_headers/, etc.
"""
import json
import sqlite3
import os
import glob
import argparse

def load_jsonl(folder_path):
    rows = []
    for f in glob.glob(f"{folder_path}/*.jsonl"):
        with open(f, encoding="utf-8") as fp:
            for line in fp:
                line = line.strip()
                if line:
                    try:
                        rows.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    return rows

NUM_FIELDS = {
    'totalNetAmount', 'netAmount', 'amountInTransactionCurrency',
    'amountInCompanyCodeCurrency', 'requestedQuantity', 'billingQuantity',
    'actualDeliveryQuantity', 'grossWeight', 'netWeight'
}

def insert_rows(conn, table, rows, fields):
    if not rows:
        print(f"  {table}: 0 rows (no data found)")
        return
    c = conn.cursor()
    placeholders = ",".join(["?" for _ in fields])
    field_str = ",".join(fields)
    data = []
    for r in rows:
        row = []
        for f in fields:
            v = r.get(f)
            if isinstance(v, bool):
                v = int(v)
            elif isinstance(v, dict):
                v = None
            elif f in NUM_FIELDS:
                try:
                    v = float(v) if v is not None else None
                except (ValueError, TypeError):
                    v = None
            row.append(v)
        data.append(row)
    c.executemany(
        f"INSERT OR IGNORE INTO {table} ({field_str}) VALUES ({placeholders})", data
    )
    conn.commit()
    print(f"  {table}: {len(data)} rows loaded")

def build(data_dir, db_path):
    print(f"Building database at: {db_path}")
    print(f"Reading data from:    {data_dir}\n")

    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    c.executescript("""
    CREATE TABLE IF NOT EXISTS sales_order_headers (
        salesOrder TEXT PRIMARY KEY, salesOrderType TEXT, salesOrganization TEXT,
        soldToParty TEXT, creationDate TEXT, totalNetAmount REAL,
        overallDeliveryStatus TEXT, overallOrdReltdBillgStatus TEXT,
        transactionCurrency TEXT, requestedDeliveryDate TEXT, customerPaymentTerms TEXT
    );
    CREATE TABLE IF NOT EXISTS sales_order_items (
        salesOrder TEXT, salesOrderItem TEXT, material TEXT,
        requestedQuantity REAL, requestedQuantityUnit TEXT, netAmount REAL,
        materialGroup TEXT, productionPlant TEXT, storageLocation TEXT,
        PRIMARY KEY (salesOrder, salesOrderItem)
    );
    CREATE TABLE IF NOT EXISTS outbound_delivery_headers (
        deliveryDocument TEXT PRIMARY KEY, creationDate TEXT, shippingPoint TEXT,
        overallGoodsMovementStatus TEXT, overallPickingStatus TEXT, deliveryBlockReason TEXT
    );
    CREATE TABLE IF NOT EXISTS outbound_delivery_items (
        deliveryDocument TEXT, deliveryDocumentItem TEXT,
        referenceSdDocument TEXT, referenceSdDocumentItem TEXT,
        actualDeliveryQuantity REAL, plant TEXT, storageLocation TEXT,
        PRIMARY KEY (deliveryDocument, deliveryDocumentItem)
    );
    CREATE TABLE IF NOT EXISTS billing_document_headers (
        billingDocument TEXT PRIMARY KEY, billingDocumentType TEXT,
        creationDate TEXT, billingDocumentDate TEXT,
        billingDocumentIsCancelled INTEGER, totalNetAmount REAL,
        transactionCurrency TEXT, companyCode TEXT, fiscalYear TEXT,
        accountingDocument TEXT, soldToParty TEXT
    );
    CREATE TABLE IF NOT EXISTS billing_document_items (
        billingDocument TEXT, billingDocumentItem TEXT, material TEXT,
        billingQuantity REAL, netAmount REAL, transactionCurrency TEXT,
        referenceSdDocument TEXT, referenceSdDocumentItem TEXT,
        PRIMARY KEY (billingDocument, billingDocumentItem)
    );
    CREATE TABLE IF NOT EXISTS journal_entries (
        accountingDocument TEXT, accountingDocumentItem TEXT,
        companyCode TEXT, fiscalYear TEXT, glAccount TEXT,
        referenceDocument TEXT, transactionCurrency TEXT,
        amountInTransactionCurrency REAL, postingDate TEXT,
        documentDate TEXT, accountingDocumentType TEXT, customer TEXT,
        clearingDate TEXT, clearingAccountingDocument TEXT,
        PRIMARY KEY (accountingDocument, accountingDocumentItem)
    );
    CREATE TABLE IF NOT EXISTS payments (
        accountingDocument TEXT, accountingDocumentItem TEXT,
        companyCode TEXT, fiscalYear TEXT, clearingDate TEXT,
        clearingAccountingDocument TEXT, amountInTransactionCurrency REAL,
        transactionCurrency TEXT, customer TEXT, postingDate TEXT,
        documentDate TEXT, glAccount TEXT,
        PRIMARY KEY (accountingDocument, accountingDocumentItem)
    );
    CREATE TABLE IF NOT EXISTS business_partners (
        businessPartner TEXT PRIMARY KEY, customer TEXT,
        businessPartnerFullName TEXT, businessPartnerName TEXT,
        creationDate TEXT, businessPartnerIsBlocked INTEGER
    );
    CREATE TABLE IF NOT EXISTS products (
        product TEXT PRIMARY KEY, productType TEXT, productOldId TEXT,
        grossWeight REAL, weightUnit TEXT, productGroup TEXT,
        baseUnit TEXT, division TEXT, creationDate TEXT, isMarkedForDeletion INTEGER
    );
    CREATE TABLE IF NOT EXISTS product_descriptions (
        product TEXT, language TEXT, productDescription TEXT,
        PRIMARY KEY (product, language)
    );
    CREATE TABLE IF NOT EXISTS billing_document_cancellations (
        billingDocument TEXT PRIMARY KEY, billingDocumentType TEXT,
        creationDate TEXT, billingDocumentIsCancelled INTEGER,
        totalNetAmount REAL, transactionCurrency TEXT,
        companyCode TEXT, accountingDocument TEXT, soldToParty TEXT
    );
    """)

    insert_rows(conn, "sales_order_headers",
        load_jsonl(f"{data_dir}/sales_order_headers"),
        ["salesOrder","salesOrderType","salesOrganization","soldToParty","creationDate",
         "totalNetAmount","overallDeliveryStatus","overallOrdReltdBillgStatus",
         "transactionCurrency","requestedDeliveryDate","customerPaymentTerms"])

    insert_rows(conn, "sales_order_items",
        load_jsonl(f"{data_dir}/sales_order_items"),
        ["salesOrder","salesOrderItem","material","requestedQuantity","requestedQuantityUnit",
         "netAmount","materialGroup","productionPlant","storageLocation"])

    insert_rows(conn, "outbound_delivery_headers",
        load_jsonl(f"{data_dir}/outbound_delivery_headers"),
        ["deliveryDocument","creationDate","shippingPoint","overallGoodsMovementStatus",
         "overallPickingStatus","deliveryBlockReason"])

    insert_rows(conn, "outbound_delivery_items",
        load_jsonl(f"{data_dir}/outbound_delivery_items"),
        ["deliveryDocument","deliveryDocumentItem","referenceSdDocument","referenceSdDocumentItem",
         "actualDeliveryQuantity","plant","storageLocation"])

    insert_rows(conn, "billing_document_headers",
        load_jsonl(f"{data_dir}/billing_document_headers"),
        ["billingDocument","billingDocumentType","creationDate","billingDocumentDate",
         "billingDocumentIsCancelled","totalNetAmount","transactionCurrency","companyCode",
         "fiscalYear","accountingDocument","soldToParty"])

    insert_rows(conn, "billing_document_items",
        load_jsonl(f"{data_dir}/billing_document_items"),
        ["billingDocument","billingDocumentItem","material","billingQuantity","netAmount",
         "transactionCurrency","referenceSdDocument","referenceSdDocumentItem"])

    insert_rows(conn, "journal_entries",
        load_jsonl(f"{data_dir}/journal_entry_items_accounts_receivable"),
        ["accountingDocument","accountingDocumentItem","companyCode","fiscalYear","glAccount",
         "referenceDocument","transactionCurrency","amountInTransactionCurrency","postingDate",
         "documentDate","accountingDocumentType","customer","clearingDate","clearingAccountingDocument"])

    insert_rows(conn, "payments",
        load_jsonl(f"{data_dir}/payments_accounts_receivable"),
        ["accountingDocument","accountingDocumentItem","companyCode","fiscalYear","clearingDate",
         "clearingAccountingDocument","amountInTransactionCurrency","transactionCurrency",
         "customer","postingDate","documentDate","glAccount"])

    insert_rows(conn, "business_partners",
        load_jsonl(f"{data_dir}/business_partners"),
        ["businessPartner","customer","businessPartnerFullName","businessPartnerName",
         "creationDate","businessPartnerIsBlocked"])

    insert_rows(conn, "products",
        load_jsonl(f"{data_dir}/products"),
        ["product","productType","productOldId","grossWeight","weightUnit","productGroup",
         "baseUnit","division","creationDate","isMarkedForDeletion"])

    insert_rows(conn, "product_descriptions",
        load_jsonl(f"{data_dir}/product_descriptions"),
        ["product","language","productDescription"])

    insert_rows(conn, "billing_document_cancellations",
        load_jsonl(f"{data_dir}/billing_document_cancellations"),
        ["billingDocument","billingDocumentType","creationDate","billingDocumentIsCancelled",
         "totalNetAmount","transactionCurrency","companyCode","accountingDocument","soldToParty"])

    conn.close()
    print(f"\n✅ Database built successfully: {db_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="/tmp/sap-o2c-data", help="Path to sap-o2c-data folder")
    parser.add_argument("--db", default="o2c.db", help="Output database path")
    args = parser.parse_args()
    build(args.data_dir, args.db)
