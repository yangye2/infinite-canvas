package service

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRedactSensitiveLogFieldsRedactsCredentialKeys(t *testing.T) {
	raw := `{"api_key":"sk-abc123","Authorization":"Bearer sk-xyz","token":"tok-1","access_token":"at-1","client_secret":"s1","password":"p1","nested":{"secret_key":"sk-2","keep":"value"},"list":[{"refresh_token":"rt-1"},"plain"],"model":"gpt-image-1"}`
	var payload any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	redactSensitiveLogFields(&payload)
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	text := string(encoded)
	for _, secret := range []string{"sk-abc123", "Bearer sk-xyz", "tok-1", "at-1", "s1", "p1", "sk-2", "rt-1"} {
		if strings.Contains(text, secret) {
			t.Fatalf("expected %q to be redacted, got: %s", secret, text)
		}
	}
	for _, keep := range []string{"\"value\"", "\"plain\"", "\"gpt-image-1\""} {
		if !strings.Contains(text, keep) {
			t.Fatalf("expected %q to survive redaction, got: %s", keep, text)
		}
	}
	if !strings.Contains(text, "[redacted]") {
		t.Fatalf("expected [redacted] markers, got: %s", text)
	}
}

func TestNormalizeAICallRequestLogRedactsJSONBody(t *testing.T) {
	input := `{"model":"gpt-image-1","api_key":"sk-secret-123","prompt":"a cat"}`
	output := normalizeAICallRequestLog(input)
	if strings.Contains(output, "sk-secret-123") {
		t.Fatalf("api key leaked in JSON log: %s", output)
	}
	if !strings.Contains(output, "gpt-image-1") || !strings.Contains(output, "a cat") {
		t.Fatalf("non-sensitive fields should survive: %s", output)
	}
}

func TestNormalizeAICallRequestLogRedactsQueryStylePlainLog(t *testing.T) {
	input := "POST /v1/images/generations\napi_key: sk-plain-999\nmodel: dall-e-3"
	output := normalizeAICallRequestLog(input)
	if strings.Contains(output, "sk-plain-999") {
		t.Fatalf("api key leaked in plain log: %s", output)
	}
	if !strings.Contains(output, "dall-e-3") {
		t.Fatalf("non-sensitive fields should survive: %s", output)
	}
}

func TestNormalizeAICallRequestLogKeepsPlainTextUntouched(t *testing.T) {
	input := "generation completed in 1200ms"
	if output := normalizeAICallRequestLog(input); output != input {
		t.Fatalf("expected plain text unchanged, got: %s", output)
	}
}

func TestRedactLargePlainLogTextRedactsDataURLAndBase64(t *testing.T) {
	dataURL := "data:image/png;base64," + strings.Repeat("A", 600)
	output := redactLargePlainLogText("before " + dataURL + " after")
	if strings.Contains(output, strings.Repeat("A", 600)) {
		t.Fatalf("large data URL not redacted: %s", output[:100])
	}
	if !strings.Contains(output, "[redacted image data]") {
		t.Fatalf("expected image data marker: %s", output)
	}
	b64 := `"` + strings.Repeat("B", 600) + `"`
	output2 := redactLargePlainLogText("prefix " + b64 + " suffix")
	if strings.Contains(output2, strings.Repeat("B", 600)) {
		t.Fatalf("large base64 not redacted: %s", output2[:100])
	}
	if !strings.Contains(output2, "[redacted large base64/string]") {
		t.Fatalf("expected base64 marker: %s", output2)
	}
}

func TestRedactLargeLogStringsRedactsHugeBase64Values(t *testing.T) {
	raw := `{"image":"` + strings.Repeat("Q", 5000) + `","prompt":"tiny"}`
	var payload any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	redactLargeLogStrings(&payload)
	encoded, _ := json.Marshal(payload)
	text := string(encoded)
	if strings.Contains(text, strings.Repeat("Q", 5000)) {
		t.Fatalf("large base64 string not redacted")
	}
	if !strings.Contains(text, "tiny") {
		t.Fatalf("small values should survive: %s", text)
	}
}
