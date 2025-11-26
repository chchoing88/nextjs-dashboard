// import postgres from 'postgres';
import { createClient } from "@supabase/supabase-js";

import {
  CustomerField,
  CustomersTableType,
  FormattedCustomersTable,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from "./definitions";
import { formatCurrency } from "./utils";

// const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
export async function fetchRevenue(): Promise<Revenue[]> {
  try {
    // Artificially delay a response for demo purposes.
    // Don't do this in production :)

    console.log("Fetching revenue data...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // const data = await sql<Revenue[]>`SELECT * FROM revenue`;
    const { data, error } = await supabase.from("revenue").select("*");

    console.log("Data fetch completed after 3 seconds.");

    if (error) {
      console.error("Database Error:", error);
      throw new Error("Failed to fetch revenue data.");
    }

    // Supabase 타입 지정: 쿼리 결과에 타입 단언 사용
    return (data as Revenue[]) ?? [];
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch revenue data.");
  }
}

export async function fetchLatestInvoices() {
  try {
    // const data = await sql<LatestInvoiceRaw[]>`
    //   SELECT invoices.amount, customers.name, customers.image_url, customers.email, invoices.id
    //   FROM invoices
    //   JOIN customers ON invoices.customer_id = customers.id
    //   ORDER BY invoices.date DESC
    //   LIMIT 5`;

    const { data, error } = await supabase
      .from("invoices")
      .select("id, amount, date, customers(name, email, image_url)")
      .order("date", { ascending: false })
      .limit(5);

    if (error) {
      console.error("Database Error:", error);
      throw new Error("Failed to fetch the latest invoices.");
    }

    // Supabase 관계 쿼리 결과를 평탄화
    const latestInvoices = (data as any[]).map((invoice) => ({
      id: invoice.id,
      amount: invoice.amount,
      name: invoice.customers?.name || "",
      email: invoice.customers?.email || "",
      image_url: invoice.customers?.image_url || "",
    }));

    return latestInvoices.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch the latest invoices.");
  }
}

export async function fetchCardData() {
  try {
    // You can probably combine these into a single SQL query
    // However, we are intentionally splitting them to demonstrate
    // how to initialize multiple queries in parallel with JS.
    // const invoiceCountPromise = sql`SELECT COUNT(*) FROM invoices`;
    // const customerCountPromise = sql`SELECT COUNT(*) FROM customers`;
    // const invoiceStatusPromise = sql`SELECT
    //      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
    //      SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
    //      FROM invoices`;

    // Supabase 병렬 쿼리
    const invoiceCountPromise = supabase
      .from("invoices")
      .select("*", { count: "exact", head: true });

    const customerCountPromise = supabase
      .from("customers")
      .select("*", { count: "exact", head: true });

    // paid와 pending 합계를 별도로 조회
    const paidInvoicesPromise = supabase.from("invoices").select("amount").eq("status", "paid");

    const pendingInvoicesPromise = supabase
      .from("invoices")
      .select("amount")
      .eq("status", "pending");

    // Promise.all() 또는 Promise.allSettled() 함수를 사용하여 모든 프로미스를 동시에 시작할 수 있다.
    const [invoiceCount, customerCount, paidInvoices, pendingInvoices] = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      paidInvoicesPromise,
      pendingInvoicesPromise,
    ]);

    if (invoiceCount.error || customerCount.error || paidInvoices.error || pendingInvoices.error) {
      console.error("Database Error:", {
        invoiceCount: invoiceCount.error,
        customerCount: customerCount.error,
        paidInvoices: paidInvoices.error,
        pendingInvoices: pendingInvoices.error,
      });
      throw new Error("Failed to fetch card data.");
    }

    const numberOfInvoices = invoiceCount.count ?? 0;
    const numberOfCustomers = customerCount.count ?? 0;

    // 클라이언트 측에서 합계 계산
    const totalPaid = (paidInvoices.data || []).reduce(
      (sum, invoice) => sum + (invoice.amount || 0),
      0
    );
    const totalPending = (pendingInvoices.data || []).reduce(
      (sum, invoice) => sum + (invoice.amount || 0),
      0
    );

    const totalPaidInvoices = formatCurrency(totalPaid);
    const totalPendingInvoices = formatCurrency(totalPending);

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch card data.");
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number
): Promise<InvoicesTable[]> {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    // const invoices = await sql<InvoicesTable[]>`
    //   SELECT
    //     invoices.id,
    //     invoices.amount,
    //     invoices.date,
    //     invoices.status,
    //     customers.name,
    //     customers.email,
    //     customers.image_url
    //   FROM invoices
    //   JOIN customers ON invoices.customer_id = customers.id
    //   WHERE
    //     customers.name ILIKE ${`%${query}%`} OR
    //     customers.email ILIKE ${`%${query}%`} OR
    //     invoices.amount::text ILIKE ${`%${query}%`} OR
    //     invoices.date::text ILIKE ${`%${query}%`} OR
    //     invoices.status ILIKE ${`%${query}%`}
    //   ORDER BY invoices.date DESC
    //   LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    // `;

    // Supabase에서는 복잡한 OR 조건을 위해 여러 쿼리를 실행하거나 RPC를 사용해야 합니다.
    // 여기서는 관계 쿼리와 필터링을 사용합니다.
    // 페이지네이션 문제를 해결하기 위해 먼저 모든 데이터를 가져온 후 필터링하고 페이지네이션을 적용합니다.
    const { data, error } = await supabase
      .from("invoices")
      .select("id, amount, date, status, customer_id, customers(name, email, image_url)")
      .order("date", { ascending: false });

    if (error) {
      console.error("Database Error:", error);
      throw new Error("Failed to fetch invoices.");
    }

    // 클라이언트 측에서 필터링 (실제 프로덕션에서는 RPC 함수 사용 권장)
    const filteredData = (data || []).filter((invoice: any) => {
      const searchLower = query.toLowerCase();
      const customer = invoice.customers;
      return (
        customer?.name?.toLowerCase().includes(searchLower) ||
        customer?.email?.toLowerCase().includes(searchLower) ||
        invoice.amount?.toString().includes(searchLower) ||
        invoice.date?.toString().includes(searchLower) ||
        invoice.status?.toLowerCase().includes(searchLower)
      );
    });

    // 필터링된 데이터에서 페이지네이션 적용
    const paginatedData = filteredData.slice(offset, offset + ITEMS_PER_PAGE);

    // 결과를 타입에 맞게 변환
    const invoices: InvoicesTable[] = paginatedData.map((invoice: any) => ({
      id: invoice.id,
      customer_id: invoice.customer_id,
      amount: invoice.amount,
      date: invoice.date,
      status: invoice.status,
      name: invoice.customers?.name || "",
      email: invoice.customers?.email || "",
      image_url: invoice.customers?.image_url || "",
    }));

    return invoices;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch invoices.");
  }
}

export async function fetchInvoicesPages(query: string): Promise<number> {
  try {
    // const data = await sql`SELECT COUNT(*)
    // FROM invoices
    // JOIN customers ON invoices.customer_id = customers.id
    // WHERE
    //   customers.name ILIKE ${`%${query}%`} OR
    //   customers.email ILIKE ${`%${query}%`} OR
    //   invoices.amount::text ILIKE ${`%${query}%`} OR
    //   invoices.date::text ILIKE ${`%${query}%`} OR
    //   invoices.status ILIKE ${`%${query}%`}
    // `;

    // Supabase에서 필터링된 데이터의 개수를 가져오기 위해
    // 먼저 데이터를 조회한 후 필터링하여 개수를 계산합니다.
    // (실제 프로덕션에서는 RPC 함수 사용 권장)
    const { data, error } = await supabase
      .from("invoices")
      .select("id, amount, date, status, customers(name, email)");

    if (error) {
      console.error("Database Error:", error);
      throw new Error("Failed to fetch total number of invoices.");
    }

    // 클라이언트 측에서 필터링하여 개수 계산
    const searchLower = query.toLowerCase();
    const filteredCount = (data || []).filter((invoice: any) => {
      const customer = invoice.customers;
      return (
        customer?.name?.toLowerCase().includes(searchLower) ||
        customer?.email?.toLowerCase().includes(searchLower) ||
        invoice.amount?.toString().includes(searchLower) ||
        invoice.date?.toString().includes(searchLower) ||
        invoice.status?.toLowerCase().includes(searchLower)
      );
    }).length;

    const totalPages = Math.ceil(filteredCount / ITEMS_PER_PAGE);

    return totalPages;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch total number of invoices.");
  }
}

export async function fetchInvoiceById(id: string): Promise<InvoiceForm | undefined> {
  try {
    // const data = await sql<InvoiceForm[]>`
    //   SELECT
    //     invoices.id,
    //     invoices.customer_id,
    //     invoices.amount,
    //     invoices.status
    //   FROM invoices
    //   WHERE invoices.id = ${id};
    // `;

    const { data, error } = await supabase
      .from("invoices")
      .select("id, customer_id, amount, status")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Database Error:", error);
      throw new Error("Failed to fetch invoice.");
    }

    if (!data) {
      return undefined;
    }

    // Convert amount from cents to dollars
    return {
      ...(data as InvoiceForm),
      amount: (data as InvoiceForm).amount / 100,
    };
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch invoice.");
  }
}

export async function fetchCustomers(): Promise<CustomerField[]> {
  try {
    // const customers = await sql<CustomerField[]>`
    //   SELECT
    //     id,
    //     name
    //   FROM customers
    //   ORDER BY name ASC
    // `;

    const { data, error } = await supabase
      .from("customers")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      console.error("Database Error:", error);
      throw new Error("Failed to fetch all customers.");
    }

    return (data as CustomerField[]) ?? [];
  } catch (err) {
    console.error("Database Error:", err);
    throw new Error("Failed to fetch all customers.");
  }
}

export async function fetchFilteredCustomers(query: string): Promise<FormattedCustomersTable[]> {
  try {
    // const data = await sql<CustomersTableType[]>`
    // 	SELECT
    // 	  customers.id,
    // 	  customers.name,
    // 	  customers.email,
    // 	  customers.image_url,
    // 	  COUNT(invoices.id) AS total_invoices,
    // 	  SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
    // 	  SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
    // 	FROM customers
    // 	LEFT JOIN invoices ON customers.id = invoices.customer_id
    // 	WHERE
    // 	  customers.name ILIKE ${`%${query}%`} OR
    //     customers.email ILIKE ${`%${query}%`}
    // 	GROUP BY customers.id, customers.name, customers.email, customers.image_url
    // 	ORDER BY customers.name ASC
    //   `;

    // Supabase에서 GROUP BY와 집계를 사용하려면 RPC 함수를 사용하거나
    // 클라이언트 측에서 처리해야 합니다. 여기서는 클라이언트 측 처리로 구현합니다.
    const { data: customersData, error: customersError } = await supabase
      .from("customers")
      .select("id, name, email, image_url")
      .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
      .order("name", { ascending: true });

    if (customersError) {
      console.error("Database Error:", customersError);
      throw new Error("Failed to fetch customer table.");
    }

    // 각 고객의 인보이스 데이터를 가져와서 집계
    const customersWithStats = await Promise.all(
      (customersData || []).map(async (customer) => {
        const { data: invoices, error: invoicesError } = await supabase
          .from("invoices")
          .select("id, amount, status")
          .eq("customer_id", customer.id);

        if (invoicesError) {
          console.error("Database Error:", invoicesError);
          return {
            ...customer,
            total_invoices: 0,
            total_pending: 0,
            total_paid: 0,
          };
        }

        const total_invoices = invoices?.length || 0;
        const total_pending = (invoices || [])
          .filter((inv) => inv.status === "pending")
          .reduce((sum, inv) => sum + (inv.amount || 0), 0);
        const total_paid = (invoices || [])
          .filter((inv) => inv.status === "paid")
          .reduce((sum, inv) => sum + (inv.amount || 0), 0);

        return {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          image_url: customer.image_url,
          total_invoices,
          total_pending,
          total_paid,
        };
      })
    );

    const customers: FormattedCustomersTable[] = customersWithStats.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error("Database Error:", err);
    throw new Error("Failed to fetch customer table.");
  }
}
