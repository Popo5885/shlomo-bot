import { useAuthStore } from "./auth";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errorCode?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().token;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    useAuthStore.getState().logout();
    throw new ApiError(401, "הסשן פג תוקף");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    if (contentType.includes("application/json")) {
      const json = await res.json();
      throw new ApiError(
        res.status,
        json.message || "הבקשה נכשלה",
        json.error_code
      );
    }
    const text = await res.text();
    throw new ApiError(res.status, text || "שגיאת שרת פנימית");
  }

  if (!contentType.includes("application/json")) {
    throw new ApiError(res.status, "תשובה לא צפויה מהשרת");
  }

  const json = await res.json();

  if (!json.success) {
    throw new ApiError(
      res.status,
      json.message || "הבקשה נכשלה",
      json.error_code
    );
  }

  return json.data as T;
}

export const api = {
  get<T>(path: string) {
    return apiFetch<T>(path);
  },

  post<T>(path: string, body?: unknown) {
    return apiFetch<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(path: string, body: unknown) {
    return apiFetch<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  put<T>(path: string, body: unknown) {
    return apiFetch<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  delete<T>(path: string) {
    return apiFetch<T>(path, { method: "DELETE" });
  },
};

export { ApiError };
