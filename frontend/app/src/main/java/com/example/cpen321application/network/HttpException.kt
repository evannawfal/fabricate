package com.example.cpen321application.network

import java.io.IOException

/**
 * The back-end answered, but with a non-2xx status. Extends IOException so a
 * caller can treat "request failed" uniformly, or catch this first to branch on [code].
 */
class HttpException(val code: Int, path: String) : IOException("HTTP $code for $path")
