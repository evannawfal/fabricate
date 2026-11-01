package com.example.cpen321application.data

/** A failed back-end request; [message] can be shown to the user. */
class ApiException(override val message: String, cause: Throwable? = null) : Exception(message, cause)
