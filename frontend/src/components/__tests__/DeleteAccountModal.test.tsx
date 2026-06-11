import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import DeleteAccountModal from "../DeleteAccountModal";

describe("DeleteAccountModal Component", () => {
  it("does not render when isOpen is false", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <DeleteAccountModal
        isOpen={false}
        onClose={onClose}
        currentUser="테스터"
        onConfirm={onConfirm}
      />
    );

    expect(screen.queryByText("회원 탈퇴")).not.toBeInTheDocument();
  });

  it("renders warning message and prompts for the correct nickname when isOpen is true", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <DeleteAccountModal
        isOpen={true}
        onClose={onClose}
        currentUser="길동이"
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("회원 탈퇴")).toBeInTheDocument();
    expect(screen.getByText(/물리적으로 완전히 삭제/)).toBeInTheDocument();
    expect(screen.getByText(/"길동이"/)).toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: "탈퇴 확정" });
    expect(submitButton).toBeDisabled();
  });

  it("keeps the confirm button disabled if the input nickname does not match currentUser", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <DeleteAccountModal
        isOpen={true}
        onClose={onClose}
        currentUser="홍길동"
        onConfirm={onConfirm}
      />
    );

    const input = screen.getByPlaceholderText("본인의 닉네임 입력");
    const submitButton = screen.getByRole("button", { name: "탈퇴 확정" });

    // Type a different nickname
    fireEvent.change(input, { target: { value: "이순신" } });
    expect(submitButton).toBeDisabled();

    // Type a prefix
    fireEvent.change(input, { target: { value: "홍길" } });
    expect(submitButton).toBeDisabled();
  });

  it("enables the confirm button only when the input nickname exactly matches currentUser", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <DeleteAccountModal
        isOpen={true}
        onClose={onClose}
        currentUser="홍길동"
        onConfirm={onConfirm}
      />
    );

    const input = screen.getByPlaceholderText("본인의 닉네임 입력");
    const submitButton = screen.getByRole("button", { name: "탈퇴 확정" });

    fireEvent.change(input, { target: { value: "홍길동" } });
    expect(submitButton).not.toBeDisabled();
  });

  it("calls onClose when the cancel button or the close X button is clicked", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <DeleteAccountModal
        isOpen={true}
        onClose={onClose}
        currentUser="홍길동"
        onConfirm={onConfirm}
      />
    );

    const cancelBtn = screen.getByRole("button", { name: "취소" });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getAllByRole("button")[0]; // the 'X' button
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("triggers onConfirm and closes the modal when submitting with the correct nickname", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <DeleteAccountModal
        isOpen={true}
        onClose={onClose}
        currentUser="홍길동"
        onConfirm={onConfirm}
      />
    );

    const input = screen.getByPlaceholderText("본인의 닉네임 입력");
    const submitButton = screen.getByRole("button", { name: "탈퇴 확정" });

    fireEvent.change(input, { target: { value: "홍길동" } });
    fireEvent.click(submitButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("displays error message and does not close modal when onConfirm fails", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockRejectedValue(new Error("네트워크 오류 발생"));

    render(
      <DeleteAccountModal
        isOpen={true}
        onClose={onClose}
        currentUser="홍길동"
        onConfirm={onConfirm}
      />
    );

    const input = screen.getByPlaceholderText("본인의 닉네임 입력");
    const submitButton = screen.getByRole("button", { name: "탈퇴 확정" });

    fireEvent.change(input, { target: { value: "홍길동" } });
    fireEvent.click(submitButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    
    // Error message should show up
    await waitFor(() => {
      expect(screen.getByText("네트워크 오류 발생")).toBeInTheDocument();
    });

    // The modal should remain open (onClose not called)
    expect(onClose).not.toHaveBeenCalled();

    // Confirm button should be enabled again for retry
    expect(submitButton).not.toBeDisabled();
    expect(submitButton).toHaveTextContent("탈퇴 확정");
  });
});
