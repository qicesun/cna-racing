export type SignupUser = {
    iracingCustId: number;
    iracingName: string;
};

export type Signup = {
    eventId: string;
    user: SignupUser;
    createdAt: string; // ISO string
};

export type SignupStatus = {
    count: number;
    signedUp: boolean;
};

