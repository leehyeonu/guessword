import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import GuessForm from "../GuessForm";

describe("GuessForm Component", () => {
  it("renders correctly with default state", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GuessForm onSubmit={onSubmit} isLoading={false} isGameWon={false} />);

    const input = screen.getByPlaceholderText("추측 단어 입력...");
    const button = screen.getByLabelText("단어 추측 전송");

    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
    expect(button).toBeInTheDocument();
  });

  it("renders disabled state when isLoading is true", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GuessForm onSubmit={onSubmit} isLoading={true} isGameWon={false} />);

    const input = screen.getByPlaceholderText("추측 단어 입력...");
    const button = screen.getByLabelText("단어 추측 전송");

    expect(input).toBeDisabled();
    expect(button).toBeDisabled();
  });

  it("renders disabled state when isGameWon is true", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GuessForm onSubmit={onSubmit} isLoading={false} isGameWon={true} />);

    const input = screen.getByPlaceholderText("정답을 맞췄습니다.");
    const button = screen.getByLabelText("단어 추측 전송");

    expect(input).toBeDisabled();
    expect(button).toBeDisabled();
  });

  it("focuses input element on mount", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GuessForm onSubmit={onSubmit} isLoading={false} isGameWon={false} />);

    const input = screen.getByPlaceholderText("추측 단어 입력...");
    expect(document.activeElement).toBe(input);
  });

  it("shows real-time validation warning for non-Korean characters", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GuessForm onSubmit={onSubmit} isLoading={false} isGameWon={false} />);

    const input = screen.getByPlaceholderText("추측 단어 입력...");
    
    // Type English characters
    fireEvent.change(input, { target: { value: "apple" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "올바른 완성형 한국어 단어만 입력할 수 있습니다."
    );

    // Type valid Korean
    fireEvent.change(input, { target: { value: "하늘" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Type Korean Jamo (not complete syllable)
    fireEvent.change(input, { target: { value: "ㄱㄴㄷ" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "올바른 완성형 한국어 단어만 입력할 수 있습니다."
    );
  });

  it("displays error on submit with empty value and does not call onSubmit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GuessForm onSubmit={onSubmit} isLoading={false} isGameWon={false} />);

    const form = screen.getByPlaceholderText("추측 단어 입력...").closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!);

    expect(screen.getByRole("alert")).toHaveTextContent("단어를 입력해 주세요.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("displays error on submit with invalid input and does not call onSubmit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GuessForm onSubmit={onSubmit} isLoading={false} isGameWon={false} />);

    const input = screen.getByPlaceholderText("추측 단어 입력...");
    const form = input.closest("form")!;

    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.submit(form);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "올바른 완성형 한국어 단어만 입력해 주세요."
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit and clears input field on successful submission", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GuessForm onSubmit={onSubmit} isLoading={false} isGameWon={false} />);

    const input = screen.getByPlaceholderText("추측 단어 입력...") as HTMLInputElement;
    const form = input.closest("form")!;

    fireEvent.change(input, { target: { value: "바나나" } });
    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenCalledWith("바나나");
    await waitFor(() => {
      expect(input.value).toBe("");
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retains input value and focus when onSubmit rejects", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Server error"));
    render(<GuessForm onSubmit={onSubmit} isLoading={false} isGameWon={false} />);

    const input = screen.getByPlaceholderText("추측 단어 입력...") as HTMLInputElement;
    const form = input.closest("form")!;

    fireEvent.change(input, { target: { value: "포도" } });
    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenCalledWith("포도");
    
    // Wait to ensure mock promise rejection is processed
    await waitFor(() => {
      expect(input.value).toBe("포도");
    });
    
    // The input should be refocused after failure
    expect(document.activeElement).toBe(input);
  });
});
