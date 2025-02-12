import type { User, Message } from "./chat";

// Login
export interface LoginResponseSuccess {
	success: true;
	user: Omit<User, "password">;
}

export interface LoginResponseError {
	error: string;
}

// Register
export interface RegisterRequest {
	suUsername: string;
	suPassword: string;
	suConfirmPassword: string;
	captchaAnswer: string;
}

export interface RegisterResponseSuccess {
	success: true;
}

export interface RegisterResponseError {
	error: string;
}

export type RegisterResponse = RegisterResponseSuccess | RegisterResponseError;

// Session
export interface SessionResponseSuccess {
	success: true;
	user: Omit<User, "password">;
}

export interface SessionResponseError {
	error: string;
}

// Messages
export interface SendMessageRequest {
    content: string;
    type?: Message['type'];
    userId: string;
    chatRoomId?: string;
}

export interface SendMessageResponseSuccess {
    success: true;
    message: Message;
}

export interface SendMessageResponseError {
    success: false;
    error: string;
}

export type SendMessageResponse = SendMessageResponseSuccess | SendMessageResponseError;

export interface GetMessagesResponseSuccess {
    success: true;
    messages: Message[];
}

export interface GetMessagesResponseError {
    success: false;
    error: string;
}

export type GetMessagesResponse = GetMessagesResponseSuccess | GetMessagesResponseError;

// ----- Public Room Payloads -----

export interface PublicRoomResponseSuccess {
    success: true;
    buddyList: Omit<User, "password">[];
}

export interface PublicRoomResponseError {
    success: false;
    error: string;
}

export type PublicRoomResponse = PublicRoomResponseSuccess | PublicRoomResponseError; 